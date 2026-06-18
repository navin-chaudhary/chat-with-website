import { ChatWithWebsite } from "@/components/ChatWithWebsite";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white">
              W
            </span>
            <div>
              <h1 className="text-xl font-semibold">Chat with a Website</h1>
              <p className="text-sm text-zinc-500">
                Crawl · index · ask grounded questions with citations
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ChatWithWebsite />
      </main>
    </div>
  );
}
