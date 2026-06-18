"use client";

import { FormEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, SiteIndex, SourceCitation } from "@/lib/types";

type CrawlSummary = {
  siteId: string;
  baseUrl: string;
  pageCount: number;
  chunkCount: number;
  pages: { url: string; title: string }[];
  index?: SiteIndex;
};

export function ChatWithWebsite() {
  const [url, setUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CrawlSummary | null>(null);
  const [siteIndex, setSiteIndex] = useState<SiteIndex | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function handleCrawl(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setCrawling(true);
    setCrawlError(null);
    setSummary(null);
    setSiteIndex(null);
    setMessages([]);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Crawl failed");
      setSummary(data);
      setSiteIndex(data.index ?? null);
    } catch (err) {
      setCrawlError(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  async function handleAsk(e: FormEvent) {
    e.preventDefault();
    if (!summary || !question.trim() || chatting) return;

    const userQuestion = question.trim();
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: userQuestion }]);
    setChatting(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: summary.siteId,
          question: userQuestion,
          stream: true,
          ...(siteIndex ? { index: siteIndex } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Chat failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let sources: SourceCitation[] = [];

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", sources: [] },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            token?: string;
            sources?: SourceCitation[];
            error?: string;
          };

          if (payload.type === "sources" && payload.sources) {
            sources = payload.sources;
          } else if (payload.type === "token" && payload.token) {
            answer += payload.token;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: answer,
                  sources,
                };
              }
              return next;
            });
          } else if (payload.type === "error") {
            throw new Error(payload.error ?? "Stream error");
          }
        }
      }

      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong",
        },
      ]);
    } finally {
      setChatting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-zinc-100">Index a website</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Enter a URL to crawl. We stay on the same domain, respect robots.txt,
          and rate-limit requests.
        </p>
        <form onSubmit={handleCrawl} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={crawling}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={crawling || !url.trim()}
            className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {crawling ? "Crawling…" : "Crawl & index"}
          </button>
        </form>
        {crawlError && (
          <p className="mt-3 text-sm text-red-400">{crawlError}</p>
        )}
        {summary && (
          <div className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-4 text-sm">
            <p className="font-medium text-emerald-300">
              Indexed {summary.pageCount} pages · {summary.chunkCount} chunks
            </p>
            <p className="mt-1 truncate text-zinc-400">{summary.baseUrl}</p>
            <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-zinc-500">
              {summary.pages.slice(0, 8).map((p) => (
                <li key={p.url} className="truncate">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-sky-400"
                  >
                    {p.title || p.url}
                  </a>
                </li>
              ))}
              {summary.pages.length > 8 && (
                <li className="text-zinc-600">
                  +{summary.pages.length - 8} more pages
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      {summary && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-zinc-100">Ask questions</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Answers are grounded in crawled pages with source links.
          </p>

          <div className="mt-4 max-h-[28rem] space-y-4 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-600">
                Ask anything about the indexed site — e.g. &quot;What services do
                they offer?&quot;
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "ml-8 bg-sky-950/50 text-sky-100"
                    : "mr-8 bg-zinc-900 text-zinc-200"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="markdown text-zinc-200 [&_a]:text-sky-400 [&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-2 [&_strong]:text-zinc-100 [&_ul]:list-disc">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content || (chatting ? "…" : "")}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Sources
                    </p>
                    <ul className="mt-2 space-y-2">
                      {msg.sources.map((s) => (
                        <li key={s.url}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 hover:underline"
                          >
                            {s.title}
                          </a>
                          <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">
                            {s.snippet}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleAsk} className="mt-4 flex gap-3">
            <input
              type="text"
              placeholder="Your question…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={chatting}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={chatting || !question.trim()}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chatting ? "Thinking…" : "Ask"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
