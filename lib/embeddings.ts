const EMBEDDING_DIM = 384;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function hashToken(token: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i]! * vec[i]!;
  const mag = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / mag;
  return vec;
}

export async function embedText(text: string): Promise<number[]> {
  const trunc = text.length > 12000 ? `${text.slice(0, 12000)} truncated` : text;
  const tokens = tokenize(trunc);
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);

  for (const token of tokens) {
    const h1 = hashToken(token, 2166136261);
    const h2 = hashToken(token, 1315423911);
    vec[h1 % EMBEDDING_DIM] += 1;
    vec[h2 % EMBEDDING_DIM] -= 0.5;
  }

  return normalize(vec);
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}
