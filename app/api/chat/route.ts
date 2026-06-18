import { NextRequest } from "next/server";
import { z } from "zod";
import {
  answerWithContext,
  chunksToCitations,
  streamAnswerWithContext,
} from "@/lib/groq-chat";
import { retrieveChunks } from "@/lib/retrieve";
import { resolveSiteIndex } from "@/lib/resolve-index";

export const runtime = "nodejs";
export const maxDuration = 60;

const siteIndexSchema = z.object({
  siteId: z.string(),
  baseUrl: z.string(),
  domain: z.string(),
  crawledAt: z.number(),
  pageCount: z.number(),
  chunks: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      title: z.string(),
      text: z.string(),
      embedding: z.array(z.number()),
    }),
  ),
});

const bodySchema = z.object({
  siteId: z.string().min(1),
  question: z.string().min(1),
  stream: z.boolean().optional(),
  index: siteIndexSchema.optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "siteId and question are required" },
        { status: 400 },
      );
    }

    const { siteId, question, stream, index: clientIndex } = parsed.data;
    const index = resolveSiteIndex(siteId, clientIndex);
    if (!index) {
      return Response.json(
        { error: "Site not indexed. Crawl a URL first." },
        { status: 404 },
      );
    }

    const relevant = await retrieveChunks(question, index.chunks);

    if (relevant.length === 0) {
      const answer =
        "I could not find relevant information about that on this website. Try rephrasing your question or crawl a page that covers this topic.";
      return Response.json({
        answer,
        sources: [],
      });
    }

    const contextChunks = relevant.map((c) => ({
      url: c.url,
      title: c.title,
      text: c.text,
    }));
    const sources = chunksToCitations(contextChunks);

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "sources", sources })}\n\n`,
              ),
            );
            for await (const token of streamAnswerWithContext(
              question.trim(),
              contextChunks,
            )) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "token", token })}\n\n`,
                ),
              );
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
            );
          } catch (e) {
            const message =
              e instanceof Error ? e.message : "Streaming failed";
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: message })}\n\n`,
              ),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const answer = await answerWithContext(question.trim(), contextChunks);
    return Response.json({ answer, sources });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 500 },
    );
  }
}
