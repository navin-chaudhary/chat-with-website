/**
 * Basic retrieval eval — run after implementing crawl/index.
 * Example pairs: question → expected URL substring on indexed site.
 *
 * Usage: npx tsx scripts/eval-retrieval.ts
 */
import { chunkPages } from "../lib/chunking";
import { crawlWebsite } from "../lib/crawler/crawl";
import { embedMany, embedText } from "../lib/embeddings";
import { topKSimilarMMR } from "../lib/similarity";

const TEST_URL = process.env.EVAL_URL ?? "https://example.com";

const CASES = [
  {
    question: "What is this domain used for?",
    expectedUrlPart: "example.com",
  },
  {
    question: "Who manages example domains?",
    expectedUrlPart: "iana",
  },
];

async function main() {
  console.log(`Crawling ${TEST_URL}…`);
  const { pages } = await crawlWebsite(TEST_URL, { maxPages: 5, maxDepth: 1 });
  const rawChunks = chunkPages(pages);
  const embeddings = await embedMany(rawChunks.map((c) => c.text));
  const chunks = rawChunks.map((c, i) => ({ ...c, embedding: embeddings[i]! }));

  let hits = 0;
  for (const { question, expectedUrlPart } of CASES) {
    const qEmb = await embedText(question);
    const top = topKSimilarMMR(qEmb, chunks, 3);
    const found = top.some((c) => c.url.includes(expectedUrlPart));
    console.log(
      `${found ? "✓" : "✗"} "${question}" → top URLs: ${top.map((c) => c.url).join(", ")}`,
    );
    if (found) hits++;
  }

  console.log(`\n${hits}/${CASES.length} cases retrieved expected source`);
}

main().catch(console.error);
