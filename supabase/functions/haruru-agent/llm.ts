// 하루루 LLM 호출 유틸 — Anthropic + OpenAI

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.max_tokens ?? 2000,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}

export async function callClaudeJson<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
}): Promise<T> {
  const raw = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: opts.system,
    messages: [{ role: "user", content: opts.userContent }],
    max_tokens: 800,
  });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM이 JSON 반환 실패: ${raw.slice(0, 200)}`);
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`JSON parse 실패: ${jsonMatch[0].slice(0, 200)}`);
  }
}

export async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI embed ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

export async function callClaudeStream(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  onDelta: (delta: string) => void;
  max_tokens?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.max_tokens ?? 2000,
      temperature: 0.2,
      system: opts.system,
      messages: opts.messages,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const t = !res.ok ? await res.text() : "no body";
    throw new Error(`Anthropic stream ${res.status}: ${t.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          const t = ev.delta.text ?? "";
          fullText += t;
          opts.onDelta(t);
        }
      } catch {
        // skip
      }
    }
  }
  return fullText;
}
