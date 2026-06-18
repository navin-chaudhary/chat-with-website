import Groq from "groq-sdk";
import type { Chunk, SourceCitation } from "@/lib/types";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export type ContextChunk = Pick<Chunk, "url" | "title" | "text">;

function formatContext(chunks: ContextChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}]\nURL: ${c.url}\nTitle: ${c.title}\nContent:\n${c.text}`,
    )
    .join("\n\n---\n\n");
}

export async function answerWithContext(
  question: string,
  contextChunks: ContextChunk[],
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const groq = new Groq({ apiKey: key });
  const context = formatContext(contextChunks);

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using ONLY the provided website excerpts. " +
          "Every factual claim must be supported by the excerpts. " +
          "When the excerpts do not contain enough information to answer, say clearly: " +
          '"I could not find that information on this website." Do not guess or use outside knowledge. ' +
          "Reference sources inline as [Source N] matching the numbered excerpts. " +
          "Be concise. Use Markdown for lists and emphasis when helpful.",
      },
      {
        role: "user",
        content: `Website excerpts:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from Groq");
  return text;
}

export async function* streamAnswerWithContext(
  question: string,
  contextChunks: ContextChunk[],
): AsyncGenerator<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const groq = new Groq({ apiKey: key });
  const context = formatContext(contextChunks);

  const stream = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using ONLY the provided website excerpts. " +
          "When information is missing, say you could not find it on this website. " +
          "Reference sources as [Source N]. Be concise. Use Markdown when helpful.",
      },
      {
        role: "user",
        content: `Website excerpts:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export function chunksToCitations(
  chunks: ContextChunk[],
): SourceCitation[] {
  const seen = new Set<string>();
  const citations: SourceCitation[] = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.url)) continue;
    seen.add(chunk.url);
    citations.push({
      url: chunk.url,
      title: chunk.title,
      snippet:
        chunk.text.length > 240
          ? `${chunk.text.slice(0, 240)}…`
          : chunk.text,
    });
  }

  return citations;
}
