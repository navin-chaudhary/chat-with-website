import type { CrawledPage } from "@/lib/types";
import { extractPageContent } from "@/lib/crawler/extract";
import {
  CRAWLER_USER_AGENT,
  getCrawlDelayMs,
  isAllowedByRobots,
} from "@/lib/crawler/robots";
import { getDomain, isSameSite, normalizeUrl, resolveUrl } from "@/lib/url-utils";

export type CrawlOptions = {
  maxPages?: number;
  maxDepth?: number;
};

export type CrawlResult = {
  baseUrl: string;
  domain: string;
  pages: CrawledPage[];
  skipped: { url: string; reason: string }[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function crawlWebsite(
  startUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const baseUrl = normalizeUrl(startUrl);
  const domain = getDomain(baseUrl);
  const maxPages = options.maxPages ?? Number(process.env.CRAWL_MAX_PAGES ?? 40);
  const maxDepth = options.maxDepth ?? Number(process.env.CRAWL_MAX_DEPTH ?? 3);

  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: baseUrl, depth: 0 }];
  const pages: CrawledPage[] = [];
  const skipped: { url: string; reason: string }[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const canonical = normalizeUrl(url);

    if (visited.has(canonical)) continue;
    visited.add(canonical);

    if (!isSameSite(canonical, domain)) {
      skipped.push({ url: canonical, reason: "outside domain" });
      continue;
    }

    if (depth > maxDepth) {
      skipped.push({ url: canonical, reason: "max depth exceeded" });
      continue;
    }

    const allowed = await isAllowedByRobots(canonical);
    if (!allowed) {
      skipped.push({ url: canonical, reason: "blocked by robots.txt" });
      continue;
    }

    const delay = await getCrawlDelayMs(canonical);
    await sleep(delay);

    let html: string;
    try {
      const res = await fetch(canonical, {
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (!res.ok) {
        skipped.push({ url: canonical, reason: `HTTP ${res.status}` });
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) {
        skipped.push({ url: canonical, reason: "not HTML" });
        continue;
      }

      html = await res.text();
    } catch (e) {
      skipped.push({
        url: canonical,
        reason: e instanceof Error ? e.message : "fetch failed",
      });
      continue;
    }

    const { title, text, links } = extractPageContent(html, canonical);

    if (text.length >= 80) {
      pages.push({ url: canonical, title, text });
    } else {
      skipped.push({ url: canonical, reason: "insufficient text content" });
    }

    if (depth < maxDepth) {
      for (const href of links) {
        const resolved = resolveUrl(href, canonical);
        if (!resolved) continue;
        if (!isSameSite(resolved, domain)) continue;
        const next = normalizeUrl(resolved);
        if (!visited.has(next)) {
          queue.push({ url: next, depth: depth + 1 });
        }
      }
    }
  }

  return { baseUrl, domain, pages, skipped };
}
