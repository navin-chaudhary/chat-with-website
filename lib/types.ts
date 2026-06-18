export type Chunk = {
  id: string;
  url: string;
  title: string;
  text: string;
  embedding: number[];
};

export type CrawledPage = {
  url: string;
  title: string;
  text: string;
};

export type SiteIndex = {
  siteId: string;
  baseUrl: string;
  domain: string;
  crawledAt: number;
  pageCount: number;
  chunks: Chunk[];
};

export type SourceCitation = {
  url: string;
  title: string;
  snippet: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
};
