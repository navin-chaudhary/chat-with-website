# Chat with a Website

A take-home assignment app: crawl a single website, index its content, and chat with answers grounded in that site's pages — with source links on every response.

**Stack:** Next.js 15 (App Router)  · Tailwind CSS · Node.js API routes · Groq (LLM)

---

## Quick start

```bash
cd chat-with-website
npm install
cp .env.example .env.local
# Add your GROQ_API_KEY to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):

1. Enter a URL and click **Crawl & index**
2. Wait for the green summary (pages + chunks indexed)
3. Ask a question in the chat box

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | **Yes** | — | API key from [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq chat model |
| `CRAWL_MAX_PAGES` | No | `40` | Max pages per crawl |
| `CRAWL_MAX_DEPTH` | No | `3` | Max link depth from start URL |
| `CRAWL_DELAY_MS` | No | `800` | Delay between requests (ms); also respects `crawl-delay` from robots.txt |

---

## Assignment requirements coverage

| Requirement | Implementation |
|-------------|----------------|
| Accept URL, crawl, build searchable index | `POST /api/crawl` — BFS crawl → chunk → embed → save index |
| Stay in scope (same domain, page/depth limits) | Same-hostname filter, `CRAWL_MAX_PAGES`, `CRAWL_MAX_DEPTH` |
| Be polite (robots.txt, rate limiting) | `robots-parser`, per-request delay, custom user-agent |
| Chat interface | `ChatWithWebsite` component — URL input + chat box |
| Source citations on every answer | API returns `sources[]` (URL, title, snippet); shown in UI |
| Stay grounded (say when info is missing) | Retrieval gate + strict Groq system prompt |

### Stretch goals

| Stretch goal | Status |
|--------------|--------|
| Boilerplate stripping (nav, footer, cookies) | **Done** — `lib/crawler/extract.ts` |
| JavaScript-rendered pages | **Not implemented** — raw HTML fetch only |
| Streaming responses | **Done** — SSE from `/api/chat` |
| Basic retrieval eval | **Done** — `scripts/eval-retrieval.ts` |

---

## Architecture

```
User URL
   │
   ▼
POST /api/crawl ──► BFS crawler (robots.txt, rate limit, same-domain)
   │                    │
   │                    ▼
   │               HTML extract + boilerplate strip
   │                    │
   │                    ▼
   │               Chunk (~900 chars, ~150 overlap)
   │                    │
   │                    ▼
   │               Local hash embeddings (title + text)
   │                    │
   │                    ▼
   │               Save to .data/indexes/{siteId}.json
   │
User question
   │
   ▼
POST /api/chat ──► Load index ──► Hybrid retrieval (MMR + lexical)
   │                                    │
   │                                    ▼
   │                          Groq LLM (grounded prompt)
   │                                    │
   └────────────────────────────────────┴──► Answer + source citations (streamed)
```

---

## Crawling strategy

**Algorithm:** Breadth-first search starting from the submitted URL.

**Scope:**
- Only follows links on the same domain (including subdomains, e.g. `blog.example.com` under `example.com`)
- Skips external links, non-HTML responses, and pages with fewer than 80 characters of extractable text
- Stops at `CRAWL_MAX_PAGES` (default 40) and `CRAWL_MAX_DEPTH` (default 3)

**Politeness:**
- Fetches and parses `robots.txt` per origin; disallowed paths are skipped
- Waits `CRAWL_DELAY_MS` between requests (default 800 ms), or uses `crawl-delay` from robots.txt when present
- User-agent: `ChatWithWebsiteBot/1.0 (+educational assignment)`
- 15 s fetch timeout per page

**Content extraction:**
- Strips `script`, `style`, `nav`, `footer`, `header`, cookie banners, and similar boilerplate
- Prefers text from `<main>`, then `<article>`, then `<body>`
- Collects same-domain links for the crawl queue

**Known limitation — SPAs:** Sites that load content via JavaScript (e.g. Next.js client-rendered pages) return mostly empty HTML shells. Only server-rendered text is indexed. For example, crawling `example.com` indexes the homepage well but `/products` yields almost no product text.

---

## Chunking & retrieval

### Chunking

- Pages split into ~**900-character** chunks with ~**150-character** overlap
- Splits on paragraph boundaries where possible (`lib/chunking.ts`)

### Embeddings

- **Local hash-based vectors** (384-dim) — no external embedding API
- Fast and free, but weaker than model-based embeddings on paraphrased queries (e.g. *"services"* vs *"RFQ matching"*)
- Each chunk is embedded as `title + text` at index time

### Retrieval (`lib/retrieve.ts`)

1. **Cosine similarity** between query and chunk embeddings
2. **MMR** (maximal marginal relevance, λ = 0.62) to return diverse chunks, not near-duplicates
3. **Lexical overlap** blended into the score (55% cosine + 45% keyword overlap)
4. **Adaptive threshold** — when the best match scores below 0.12, a relative cutoff is used instead of rejecting everything
5. **Small-index fallback** — for indexes with ≤ 12 chunks, always include the top 4 excerpts so short crawls still reach the LLM

If no chunks pass retrieval, the API returns a *"could not find relevant information"* message **without** calling the LLM.

---

## Keeping answers grounded

Three layers prevent hallucination:

1. **Retrieval gate** — only relevant crawled excerpts are sent to the model; empty retrieval short-circuits to a refusal
2. **System prompt** — instructs Groq to answer **only** from provided `[Source N]` excerpts and to say *"I could not find that information on this website"* when content is missing
3. **Structured citations** — the API returns `sources: [{ url, title, snippet }]` alongside every answer; the UI renders clickable source links

Temperature is set to `0.1` to reduce creative drift.

---

## Index storage

Indexes are persisted to disk with an in-process `globalThis` cache for fast reads.

| Environment | Storage path |
|-------------|--------------|
| Local dev | `.data/indexes/{siteId}.json` |
| Vercel / Lambda | `/tmp/chat-with-website-indexes/` (auto-detected) |
| Custom | Set `INDEX_DATA_DIR` env var |

- `siteId` is a base64url encoding of the domain (e.g. `example.com` → `ZXhhbXBsZS5jb20`)
- Survives Next.js dev hot-reloads
- If disk writes fail (read-only filesystem), falls back to in-memory only — no crash

**Serverless note:** On Vercel/Lambda, `/tmp` is writable but ephemeral. Crawl and chat may hit different instances, so chat can still return *"Site not indexed"* after a cold start. For a reliable production deploy, use Redis, Postgres + pgvector, or a vector DB.

---

## API reference

### `POST /api/crawl`

```json
{ "url": "https://example.com" }
```

**Response (200):**
```json
{
  "siteId": "ZXhhbXBsZS5jb20",
  "baseUrl": "https://example.com/",
  "domain": "example.com",
  "pageCount": 1,
  "chunkCount": 2,
  "pages": [{ "url": "...", "title": "..." }],
  "skippedCount": 0
}
```

### `POST /api/chat`

```json
{
  "siteId": "ZXhhbXBsZS5jb20",
  "question": "What is this site for?",
  "stream": true
}
```

- `stream: true` (default in UI) — Server-Sent Events with `sources`, `token`, `done` events
- `stream: false` — JSON `{ answer, sources }`

**Errors:**
- `404` — site not indexed (crawl first)
- `400` — missing `siteId` or `question`

---

## Manual testing

Suggested sites and questions:

| Site | Why | Sample question |
|------|-----|-----------------|
| `https://example.com` | Simple static HTML | *What is example.com used for?* |
| `https://books.toscrape.com` | Multi-page, same-domain crawl | *What kinds of books are sold?* |

**Grounding test:** ask something not on the site (e.g. *What is the stock price of Apple?*) — expect a refusal, not a fabricated answer.

**Scope test:** after crawling `books.toscrape.com`, confirm all indexed URLs stay on that domain.

**curl example:**
```bash
# Crawl
curl -X POST http://localhost:3000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Chat (use siteId from crawl response)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"siteId":"ZXhhbXBsZS5jb20","question":"What is this site for?","stream":false}'
```

---

## Retrieval eval

A basic script to measure whether retrieval returns expected source URLs:

```bash
npx tsx scripts/eval-retrieval.ts

# Test a different site
EVAL_URL=https://books.toscrape.com npx tsx scripts/eval-retrieval.ts
```

Edit `CASES` in `scripts/eval-retrieval.ts` to add question → expected URL substring pairs.

---

## Project structure

```
app/
  api/crawl/route.ts      # Crawl + index endpoint
  api/chat/route.ts       # RAG chat (streaming SSE)
  page.tsx                # Main page
components/
  ChatWithWebsite.tsx     # URL input, crawl summary, chat UI
lib/
  crawler/
    crawl.ts              # BFS crawler
    extract.ts            # HTML parsing + boilerplate removal
    robots.ts             # robots.txt parsing
  chunking.ts             # Text splitting
  embeddings.ts           # Local hash embeddings
  similarity.ts           # Cosine similarity + MMR
  retrieve.ts             # Hybrid retrieval + adaptive threshold
  groq-chat.ts            # Groq LLM (stream + non-stream)
  index-store.ts          # Disk + memory index store
  url-utils.ts            # URL normalization, domain checks
  types.ts
scripts/
  eval-retrieval.ts       # Basic retrieval eval
.data/
  indexes/                # Persisted site indexes (gitignored)
```

---

## What works well

- Polite, scoped crawl with robots.txt and rate limiting
- Clean text extraction with boilerplate stripping on static HTML sites
- Grounded answers with inline `[Source N]` references and structured citations
- Streaming chat for responsive UX
- Disk-persisted indexes that survive dev server reloads

## Known limitations (honest)

| Area | Issue |
|------|-------|
| **SPAs** | Client-rendered pages return empty shells; product listings and dashboards are often missed |
| **Embeddings** | Hash vectors miss semantic paraphrases; retrieval is weaker than OpenAI/Cohere embeddings |
| **Long pages** | Fixed 900-char chunks can split related context; no hierarchical or section-aware chunking |
| **Single user** | File-based index store is not suitable for multi-tenant production |
| **Eval script** | Uses raw MMR, not the full `retrieve.ts` pipeline; scores may differ from live chat |

---

## What I'd improve with more time

1. **Real embeddings** — OpenAI `text-embedding-3-small` or a local `all-MiniLM-L6-v2` model; biggest retrieval quality win
2. **Playwright** — headless browser pass for JS-rendered pages, with a strict page budget
3. **pgvector / Qdrant** — persistent, queryable vector store for production deploys
4. **Sitemap seeding** — bootstrap the crawl queue from `/sitemap.xml` for better coverage
5. **Expanded eval suite** — MRR@k over a fixed question set, tracked in CI

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npx tsx scripts/eval-retrieval.ts` | Run retrieval eval |
