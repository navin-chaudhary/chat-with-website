export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function topKSimilarMMR<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  items: T[],
  k: number,
  lambda = 0.62,
): T[] {
  const pool = items.map((item) => ({
    item,
    relevance: cosineSimilarity(queryEmbedding, item.embedding),
  }));
  pool.sort((a, b) => b.relevance - a.relevance);

  const selected: typeof pool = [];

  while (selected.length < k && pool.length > 0) {
    let bestI = 0;
    let bestMMR = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const relevance = pool[i]!.relevance;
      let maxSimToSelected = 0;
      for (const s of selected) {
        const sim = cosineSimilarity(
          pool[i]!.item.embedding,
          s.item.embedding,
        );
        if (sim > maxSimToSelected) maxSimToSelected = sim;
      }
      const mmr = lambda * relevance - (1 - lambda) * maxSimToSelected;
      if (mmr > bestMMR) {
        bestMMR = mmr;
        bestI = i;
      }
    }
    selected.push(pool.splice(bestI, 1)[0]!);
  }

  return selected.map((s) => s.item);
}
