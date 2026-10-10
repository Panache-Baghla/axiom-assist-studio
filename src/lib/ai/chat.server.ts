import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

export type ChatMode = "instant" | "think" | "reasoning" | "build" | "web" | "generate";

const BASE = `You are OmniAI, a warm, friendly and highly capable assistant.
Answer style:
- Lead with the direct answer, then only the detail that helps. Not too long, not too short: match length to the question.
- Be friendly and natural, like a helpful expert friend. Use light markdown (headings, lists, tables) when it aids clarity.
- Be accurate. Verify reasoning step by step internally. If unsure, say so plainly rather than guessing. Never invent facts, citations or numbers.
- Math: use LaTeX with $...$ inline and $$...$$ for display. Show key steps for STEM problems and box or bold the final answer.
- Code: production-quality, complete, idiomatic, with fenced code blocks and language tags. Briefly explain tricky parts.
- Users may attach images and PDFs; read them carefully when present.
- Reply in the same language the user writes in.
- Refuse abusive, hateful, or harmful content and anything that could hurt a person; offer a safe alternative kindly.`;

const MODE: Record<ChatMode, string> = {
  instant: "Reply quickly and concisely.",
  think: "Think deeply and thoroughly before answering. Consider edge cases.",
  reasoning:
    "You are in advanced reasoning & mathematics mode. Solve rigorously, check every step, verify the final answer.",
  build: `You are in BUILD mode: you build websites and apps directly.
Return a short friendly intro sentence, then ONE complete self-contained HTML document in a single \`\`\`html code block (inline CSS and JS, may use CDN scripts like Tailwind CDN). Make it polished, modern, responsive and fully working. After the block, add 1-3 bullet notes on what to try next.`,
  web: "You are in WEB SEARCH mode. Always search the web for up-to-date information before answering, and base the answer on what you find.",
  generate: "",
};

const EFFORT: Record<ChatMode, "low" | "medium" | "high"> = {
  instant: "low",
  think: "high",
  reasoning: "high",
  build: "medium",
  web: "low",
  generate: "low",
};

const IMG_RE = /!\[[^\]]*\]\((https?:[^)\s]+)\)/g;
const PDF_RE = /\[📄 [^\]]*\]\((https?:[^)\s]+)\)/g;

function toModelMessage(m: { role: "user" | "assistant"; content: string }): ModelMessage {
  if (m.role === "assistant") return { role: "assistant", content: m.content };
  const imgs = [...m.content.matchAll(IMG_RE)].map((x) => x[1]!);
  const pdfs = [...m.content.matchAll(PDF_RE)].map((x) => x[1]!);
  if (!imgs.length && !pdfs.length) return { role: "user", content: m.content };
  const text = m.content.replace(IMG_RE, "").replace(PDF_RE, "").trim() || "Please look at the attachment.";
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...imgs.map((u) => ({ type: "image" as const, image: new URL(u) })),
      ...pdfs.map((u) => ({ type: "file" as const, data: new URL(u), mediaType: "application/pdf" })),
    ],
  };
}

async function generateImage(prompt: string, apiKey: string, userId: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: "openai/gpt-image-2.5-sunburst", prompt }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string };
    const msg = typeof err.error === "string" ? err.error : err.error?.message || err.message;
    return json({ error: msg || "Image generation failed." }, res.status);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return json({ error: "No image was returned. Please try again." }, 502);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `${userId}/gen-${crypto.randomUUID()}.png`;
  const up = await supabaseAdmin.storage.from("omni-files").upload(path, bytes, { contentType: "image/png" });
  if (up.error) return json({ error: "Couldn't save the image." }, 500);
  const signed = await supabaseAdmin.storage.from("omni-files").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (!signed.data) return json({ error: "Couldn't save the image." }, 500);
  const alt = prompt.replace(/[[\]\n]/g, " ").slice(0, 80);
  return new Response(`Here's your image ✨\n\n![${alt}](${signed.data.signedUrl})`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function handleChat(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!token || !url || !key) return json({ error: "Please sign in." }, 401);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Please sign in." }, 401);

  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return json({ error: "AI is not configured." }, 500);

  const body = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    mode?: ChatMode;
    userName?: string;
    projectInstructions?: string;
  };
  const mode: ChatMode = body.mode && body.mode in MODE ? body.mode : "instant";
  const raw = (body.messages ?? []).filter((m) => m.content?.trim());

  if (mode === "generate") {
    const last = [...raw].reverse().find((m) => m.role === "user");
    if (!last) return json({ error: "Describe the image you want." }, 400);
    return generateImage(last.content.replace(IMG_RE, "").slice(0, 4000), apiKey, data.claims.sub);
  }

  const messages: ModelMessage[] = raw.map(toModelMessage);

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const today = new Date().toUTCString();
  const project = body.projectInstructions?.trim() ? `\n\nProject instructions from the user:\n${body.projectInstructions.slice(0, 4000)}` : "";
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: `${BASE}\n\n${MODE[mode]}\n\nCurrent date: ${today}.${body.userName ? ` The user's name is ${body.userName}.` : ""}${project}`,
    messages,
    abortSignal: request.signal,
    ...(mode === "web" ? { tools: { web_search: provider.tools.webSearch({}) } } : {}),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: EFFORT[mode],
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sources = new Map<string, string>();
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") controller.enqueue(enc.encode(part.text));
          else if (part.type === "source" && part.sourceType === "url") sources.set(part.url, part.title || part.url);
          else if (part.type === "error") throw part.error;
        }
        if (sources.size) {
          const list = [...sources].slice(0, 8).map(([u, t], i) => `${i + 1}. [${t.replace(/[[\]]/g, "")}](${u})`).join("\n");
          controller.enqueue(enc.encode(`\n\n---\n**Sources**\n${list}`));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return withLovableAiGatewayRunIdHeader(
    new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    runIdFetch,
  );
}

export async function handleCorrect(request: Request) {
  const apiKey = process.env['LOVABLE_API_KEY'];
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!apiKey || !token || !url || !key) return json({ error: "Please sign in." }, 401);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Please sign in." }, 401);
  const { text } = (await request.json()) as { text: string };
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions:
      "Fix grammar, spelling and sentence structure of the user's text. Keep meaning, language and tone. Output only the corrected text, nothing else.",
    messages: [{ role: "user", content: text }],
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", store: false } },
  });
  return json({ text: (await result.text).trim() });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
