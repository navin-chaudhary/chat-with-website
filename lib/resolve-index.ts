import type { SiteIndex } from "@/lib/types";
import { getSiteIndex, saveSiteIndex } from "@/lib/index-store";

const MAX_CLIENT_CHUNKS = 80;

export function isValidSiteIndex(value: unknown, siteId: string): value is SiteIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as SiteIndex;
  if (index.siteId !== siteId) return false;
  if (!Array.isArray(index.chunks) || index.chunks.length === 0) return false;
  if (index.chunks.length > MAX_CLIENT_CHUNKS) return false;

  return index.chunks.every(
    (c) =>
      typeof c.id === "string" &&
      typeof c.url === "string" &&
      typeof c.title === "string" &&
      typeof c.text === "string" &&
      Array.isArray(c.embedding) &&
      c.embedding.length > 0,
  );
}

/** Prefer server store; fall back to client-provided index on serverless. */
export function resolveSiteIndex(
  siteId: string,
  clientIndex?: unknown,
): SiteIndex | undefined {
  const stored = getSiteIndex(siteId);
  if (stored) return stored;

  if (clientIndex && isValidSiteIndex(clientIndex, siteId)) {
    saveSiteIndex(clientIndex);
    return clientIndex;
  }

  return undefined;
}

export function indexForClient(index: SiteIndex): SiteIndex | undefined {
  if (index.chunks.length > MAX_CLIENT_CHUNKS) return undefined;
  return index;
}
