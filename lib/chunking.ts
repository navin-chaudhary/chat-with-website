import type { Chunk, CrawledPage } from "@/lib/types";

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

export function chunkPages(
  pages: CrawledPage[],
): Omit<Chunk, "id" | "embedding">[] {
  const chunks: Omit<Chunk, "id" | "embedding">[] = [];

  for (const page of pages) {
    if (!page.text.trim()) continue;
    const pageChunks = splitText(page.text);
    for (const text of pageChunks) {
      chunks.push({
        url: page.url,
        title: page.title,
        text,
      });
    }
  }

  return chunks;
}

function splitText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);

  const result: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 1 <= CHUNK_SIZE) {
      current = current ? `${current} ${para}` : para;
      continue;
    }

    if (current) {
      result.push(current);
      const tail = current.slice(-CHUNK_OVERLAP);
      current = tail ? `${tail} ${para}` : para;
    } else {
      for (let i = 0; i < para.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        result.push(para.slice(i, i + CHUNK_SIZE));
      }
      current = "";
    }
  }

  if (current) result.push(current);
  return result;
}
