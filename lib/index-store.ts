import fs from "fs";
import os from "os";
import path from "path";
import type { SiteIndex } from "@/lib/types";

type GlobalStore = {
  siteIndexes?: Map<string, SiteIndex>;
  indexDiskEnabled?: boolean;
  indexDataDir?: string;
};

const globalStore = globalThis as typeof globalThis & GlobalStore;

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  );
}

function resolveDataDir(): string {
  if (process.env.INDEX_DATA_DIR) {
    return path.resolve(process.env.INDEX_DATA_DIR);
  }
  if (isServerless()) {
    // /var/task is read-only on Lambda/Vercel; /tmp is writable (ephemeral).
    return path.join(os.tmpdir(), "chat-with-website-indexes");
  }
  return path.join(process.cwd(), ".data", "indexes");
}

function dataDir(): string {
  if (!globalStore.indexDataDir) {
    globalStore.indexDataDir = resolveDataDir();
  }
  return globalStore.indexDataDir;
}

function diskEnabled(): boolean {
  return globalStore.indexDiskEnabled !== false;
}

function disableDisk(reason: unknown): void {
  if (globalStore.indexDiskEnabled === false) return;
  console.warn(
    "[index-store] Disk persistence disabled:",
    reason instanceof Error ? reason.message : reason,
  );
  globalStore.indexDiskEnabled = false;
}

function ensureDiskDir(): boolean {
  if (!diskEnabled()) return false;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    return true;
  } catch (e) {
    disableDisk(e);
    return false;
  }
}

function memory(): Map<string, SiteIndex> {
  if (!globalStore.siteIndexes) {
    globalStore.siteIndexes = new Map();
  }
  return globalStore.siteIndexes;
}

function indexPath(siteId: string): string {
  return path.join(dataDir(), `${siteId}.json`);
}

function readFromDisk(siteId: string): SiteIndex | undefined {
  if (!diskEnabled()) return undefined;
  try {
    const raw = fs.readFileSync(indexPath(siteId), "utf8");
    return JSON.parse(raw) as SiteIndex;
  } catch {
    return undefined;
  }
}

export function getSiteIndex(siteId: string): SiteIndex | undefined {
  const cached = memory().get(siteId);
  if (cached) return cached;

  const fromDisk = readFromDisk(siteId);
  if (fromDisk) {
    memory().set(siteId, fromDisk);
    return fromDisk;
  }

  return undefined;
}

export function saveSiteIndex(index: SiteIndex): void {
  memory().set(index.siteId, index);

  if (!ensureDiskDir()) return;

  try {
    fs.writeFileSync(indexPath(index.siteId), JSON.stringify(index), "utf8");
  } catch (e) {
    disableDisk(e);
  }
}

export function deleteSiteIndex(siteId: string): void {
  memory().delete(siteId);
  if (!diskEnabled()) return;
  try {
    fs.unlinkSync(indexPath(siteId));
  } catch {
    // File may not exist.
  }
}

export function listSiteIndexes(): SiteIndex[] {
  const seen = new Set<string>();
  const indexes: SiteIndex[] = [];

  for (const index of memory().values()) {
    if (!seen.has(index.siteId)) {
      seen.add(index.siteId);
      indexes.push(index);
    }
  }

  if (!diskEnabled() && !ensureDiskDir()) {
    return indexes;
  }

  try {
    for (const file of fs.readdirSync(dataDir())) {
      if (!file.endsWith(".json")) continue;
      const siteId = file.slice(0, -".json".length);
      if (seen.has(siteId)) continue;
      const index = readFromDisk(siteId);
      if (index) {
        seen.add(siteId);
        memory().set(siteId, index);
        indexes.push(index);
      }
    }
  } catch {
    // Directory may not exist yet.
  }

  return indexes;
}
