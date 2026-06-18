import fs from "fs";
import path from "path";
import type { SiteIndex } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data", "indexes");

type GlobalStore = {
  siteIndexes?: Map<string, SiteIndex>;
};

const globalStore = globalThis as typeof globalThis & GlobalStore;

function memory(): Map<string, SiteIndex> {
  if (!globalStore.siteIndexes) {
    globalStore.siteIndexes = new Map();
  }
  return globalStore.siteIndexes;
}

function indexPath(siteId: string): string {
  return path.join(DATA_DIR, `${siteId}.json`);
}

function readFromDisk(siteId: string): SiteIndex | undefined {
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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  memory().set(index.siteId, index);
  fs.writeFileSync(indexPath(index.siteId), JSON.stringify(index), "utf8");
}

export function deleteSiteIndex(siteId: string): void {
  memory().delete(siteId);
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

  try {
    for (const file of fs.readdirSync(DATA_DIR)) {
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
