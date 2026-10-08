import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

export type ChatMode = "instant" | "think" | "reasoning" | "build";

const BASE = `You are OmniAI, a warm, friendly and highly capable assistant.
Answer style:
- Lead with the direct answer, then only the detail that helps. Not too long, not too short: match length to the question.
- Be friendly and natural, like a helpful expert friend. Use light markdown (headings, lists, tables) when it aids clarity.
- Be accurate. Verify reasoning step by step internally. If unsure, say so plainly rather than guessing. Never invent facts, citations or numbers.
- Math: use LaTeX with $...$ inline and $$...$$ for display. Show key steps for STEM problems and box or bold the final answer.
- Code: production-quality, complete, idiomatic, with fenced code blocks and language tags. Briefly explain tricky parts.
- Reply in the same language the user writes in.
- Refuse abusive, hateful, or harmful content and anything that could hurt a person; offer a safe alternative kindly.`;

const MODE: Record<ChatMode, string> = {
  instant: "Reply quickly and concisely.",
  think: "Think deeply and thoroughly before answering. Consider edge cases.",
  reasoning:
    "You are in advanced reasoning & mathematics mode. Solve rigorously, check every step, verify the final answer.",
  build: `You are in BUILD mode: you build websites and apps directly.
Return a short friendly intro sentence, then ONE complete self-contained HTML document in a single \`\`\`html code block (inline CSS and JS, may use CDN scripts like Tailwind CDN). Make it polished, modern, responsive and fully working. After the block, add 1-3 bullet notes on what to try next.`,
};

const EFFORT: Record<ChatMode, "low" | "medium" | "high"> = {
  instant: "low",
  think: "high",
  reasoning: "high",
  build: "medium",
};

export async function handleChat(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return json({ error: "Please sign in." }, 401);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Please sign in." }, 401);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return json({ error: "AI is not configured." }, 500);

  const body = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    mode?: ChatMode;
    userName?: string;
  };
  const mode: ChatMode = body.mode && body.mode in MODE ? body.mode : "instant";
  const messages: ModelMessage[] = (body.messages ?? [])
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const today = new Date().toUTCString();
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: `${BASE}\n\n${MODE[mode]}\n\nCurrent date: ${today}.${body.userName ? ` The user's name is ${body.userName}.` : ""}`,
    messages,
    abortSignal: request.signal,
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

  return withLovableAiGatewayRunIdHeader(
    result.toTextStreamResponse(),
    runIdFetch,
  );
}

export async function handleCorrect(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
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
