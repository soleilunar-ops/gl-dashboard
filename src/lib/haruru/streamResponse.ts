/**
 * 하루루 SSE 스트림 파서 — haruru-agent Edge Function 응답 처리.
 *
 * 이벤트 타입:
 *   delta   — 답변 토큰 증분
 *   replace — 재시도 후 최종 답변 (delta를 덮어씀)
 *   done    — 완료 (turn_id, citations, intent, axis)
 *   error   — 치명 오류
 */

export type HaruruStreamEvent =
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; payload: HaruruDonePayload }
  | { type: "error"; message: string };

export interface HaruruDonePayload {
  intent: "on_scope" | "off_scope" | "meta";
  axis: "erp" | "coupang" | "both" | "external" | "none";
  answer_type?: string;
  turn_id?: number | null;
  final_answer?: string;
  citations?: {
    sql: number;
    rag: string[];
  };
}

export interface HaruruAskOpts {
  endpoint: string;
  accessToken: string;
  question: string;
  sessionId?: string;
  userId?: string;
  signal?: AbortSignal;
  onEvent: (ev: HaruruStreamEvent) => void;
}

export async function askHaruru(opts: HaruruAskOpts): Promise<void> {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify({
      question: opts.question,
      session_id: opts.sessionId,
      user_id: opts.userId,
    }),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      errMsg = j.error ?? errMsg;
    } catch {
      // ignore
    }
    opts.onEvent({ type: "error", message: errMsg });
    return;
  }

  if (!res.body) {
    opts.onEvent({ type: "error", message: "응답 바디 없음" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === "") {
          eventName = "";
          continue;
        }
        if (line.startsWith("event: ")) {
          eventName = line.slice(7).trim();
          continue;
        }
        if (line.startsWith("data: ")) {
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            dispatch(opts.onEvent, eventName, parsed);
          } catch (e) {
            console.warn("SSE JSON parse fail:", payload.slice(0, 100));
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("abort")) {
      opts.onEvent({ type: "error", message: msg });
    }
  }
}

function dispatch(
  onEvent: (ev: HaruruStreamEvent) => void,
  eventName: string,
  data: { text?: string; message?: string } & Record<string, unknown>
): void {
  switch (eventName) {
    case "delta":
      if (typeof data.text === "string") onEvent({ type: "delta", text: data.text });
      break;
    case "replace":
      if (typeof data.text === "string") onEvent({ type: "replace", text: data.text });
      break;
    case "done":
      onEvent({ type: "done", payload: data as unknown as HaruruDonePayload });
      break;
    case "error":
      onEvent({
        type: "error",
        message: typeof data.message === "string" ? data.message : "unknown",
      });
      break;
  }
}
