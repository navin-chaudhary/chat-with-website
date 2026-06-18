import type { Chunk } from "@/lib/types";
import { embedText } from "@/lib/embeddings";
import { cosineSimilarity, topKSimilarMMR } from "@/lib/similarity";

const TOP_K = 6;
const ABSOLUTE_MIN_RELEVANCE = 0.12;
const RELATIVE_FRACTION = 0.5;
const NOISE_FLOOR = 0.01;
const SMALL_INDEX_MAX_CHUNKS = 12;
const SMALL_INDEX_FALLBACK_K = 4;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function lexicalOverlapScore(query: string, text: string): number {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return 0;
  const tTokens = tokenize(text);
  if (tTokens.length === 0) return 0;
  let hits = 0;
  for (const t of tTokens) {
    if (qTokens.has(t)) hits++;
  }
  return hits / Math.sqrt(qTokens.size * tTokens.length);
}

function relevanceThreshold(maxScore: number): number {
  if (maxScore >= ABSOLUTE_MIN_RELEVANCE) return ABSOLUTE_MIN_RELEVANCE;
  return Math.max(maxScore * RELATIVE_FRACTION, NOISE_FLOOR);
}

export async function retrieveChunks(
  question: string,
  chunks: Chunk[],
  topK = TOP_K,
): Promise<Chunk[]> {
  const trimmed = question.trim();
  const qEmb = await embedText(trimmed);
  const top = topKSimilarMMR(qEmb, chunks, topK);

  const scored = top.map((chunk) => {
    const cosine = cosineSimilarity(qEmb, chunk.embedding);
    const lexical = lexicalOverlapScore(trimmed, `${chunk.title} ${chunk.text}`);
    const score = 0.55 * cosine + 0.45 * lexical;
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const maxScore = scored[0]?.score ?? 0;
  const threshold = relevanceThreshold(maxScore);
  const relevant = scored.filter((s) => s.score >= threshold).map((s) => s.chunk);

  if (chunks.length <= SMALL_INDEX_MAX_CHUNKS) {
    const fallback = scored
      .slice(0, Math.min(SMALL_INDEX_FALLBACK_K, scored.length))
      .map((s) => s.chunk);
    const seen = new Set(relevant.map((c) => c.id));
    for (const chunk of fallback) {
      if (!seen.has(chunk.id)) {
        relevant.push(chunk);
        seen.add(chunk.id);
      }
    }
  }

  return relevant;
}
