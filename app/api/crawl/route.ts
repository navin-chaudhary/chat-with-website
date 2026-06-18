import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chunkPages } from "@/lib/chunking";
import { crawlWebsite } from "@/lib/crawler/crawl";
import { embedMany } from "@/lib/embeddings";
import { saveSiteIndex } from "@/lib/index-store";
import { indexForClient } from "@/lib/resolve-index";
import type { Chunk } from "@/lib/types";
import { normalizeUrl, siteIdFromUrl } from "@/lib/url-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid url is required" },
        { status: 400 },
      );
    }

    const baseUrl = normalizeUrl(parsed.data.url);
    const siteId = siteIdFromUrl(baseUrl);

    const { pages, domain, skipped } = await crawlWebsite(baseUrl);

    if (pages.length === 0) {
      return NextResponse.json(
        {
          error:
            "No indexable pages were found. The site may block crawlers, require JavaScript, or have little text content.",
          skipped: skipped.slice(0, 10),
        },
        { status: 422 },
      );
    }

    const rawChunks = chunkPages(pages);
    const embeddings = await embedMany(
      rawChunks.map((c) => `${c.title}\n${c.text}`),
    );

    const chunks: Chunk[] = rawChunks.map((chunk, i) => ({
      ...chunk,
      id: `${siteId}-${i}`,
      embedding: embeddings[i]!,
    }));

    const index = {
      siteId,
      baseUrl,
      domain,
      crawledAt: Date.now(),
      pageCount: pages.length,
      chunks,
    };

    saveSiteIndex(index);

    const clientIndex = indexForClient(index);

    return NextResponse.json({
      siteId,
      baseUrl,
      domain,
      pageCount: pages.length,
      chunkCount: chunks.length,
      pages: pages.map((p) => ({ url: p.url, title: p.title })),
      skippedCount: skipped.length,
      ...(clientIndex ? { index: clientIndex } : {}),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Crawl failed" },
      { status: 500 },
    );
  }
}
