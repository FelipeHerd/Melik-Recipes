// Server-only helper for OpenAI's chat completions API.
// Used by /chef and /descubrir server functions. Replaces Lovable's AI
// Gateway — the request/response shape was already OpenAI-compatible, so
// this is a URL/key swap plus a real (non-gateway-routed) model id.

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
};

export type ChatCompletionOptions = {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

const GATEWAY_URL = "https://api.openai.com/v1/chat/completions";
// Vision-capable and cost-effective — chefChat sends image_url blocks.
const DEFAULT_MODEL = "gpt-4o-mini";

export async function chatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("APP-AI-002: missing api key");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: opts.messages,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.max_tokens !== undefined ? { max_tokens: opts.max_tokens } : {}),
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("APP-AI-001: rate limited");
    if (res.status === 402) throw new Error("APP-PERM-001: ai credits exhausted");
    console.error("[ai-gateway] error", res.status, bodyText);
    throw new Error(`APP-AI-002: gateway ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | ContentBlock[] } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  }
  return "";
}
