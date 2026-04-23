"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  askHaruru,
  type HaruruDonePayload,
  type HaruruStreamEvent,
} from "@/lib/haruru/streamResponse";

export interface HaruruTurn {
  id: string; // 클라 임시 ID
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  done?: HaruruDonePayload;
  turnDbId?: number | null;
  feedback?: "up" | "down" | null;
  error?: string;
}

const HARURU_ENDPOINT =
  process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(".supabase.co", ".functions.supabase.co") +
  "/haruru-agent";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let nextId = 1;
const genId = () => `t${nextId++}`;

export function useHaruruAgent() {
  const [turns, setTurns] = useState<HaruruTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string, answerModel?: string): Promise<void> => {
      const q = question.trim();
      if (!q || streaming) return;

      // 이전 대화 맥락 — user 질문은 보존, assistant 답변은 요약 플레이스홀더로 마스킹.
      // 이유: Sonnet이 이전 답변 형태(길이·구조)를 chain-of-style로 모방해 품질이 회귀하는 현상 방지.
      const previousTurns = turns
        .filter((t) => !t.streaming && !t.error && t.content)
        .slice(-20)
        .map((t) => ({
          role: t.role,
          content:
            t.role === "assistant"
              ? "(이전 답변 제공됨 — 형식·길이는 무시하고 현재 질문에 독립적으로 답변)"
              : t.content.length > 600
                ? t.content.slice(0, 600) + "…"
                : t.content,
        }));

      setError(null);
      const userTurn: HaruruTurn = { id: genId(), role: "user", content: q };
      const asstTurn: HaruruTurn = {
        id: genId(),
        role: "assistant",
        content: "",
        streaming: true,
      };
      setTurns((prev) => [...prev, userTurn, asstTurn]);
      setStreaming(true);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === asstTurn.id ? { ...t, streaming: false, error: "로그인이 필요해요" } : t
          )
        );
        setStreaming(false);
        setError("로그인이 필요해요");
        return;
      }

      abortRef.current = new AbortController();

      await askHaruru({
        endpoint: HARURU_ENDPOINT,
        accessToken,
        apiKey: SUPABASE_ANON_KEY,
        question: q,
        sessionId: sessionIdRef.current,
        userId: session.user?.id,
        answerModel,
        previousTurns,
        signal: abortRef.current.signal,
        onEvent: (ev: HaruruStreamEvent) => {
          if (ev.type === "delta") {
            setTurns((prev) =>
              prev.map((t) => (t.id === asstTurn.id ? { ...t, content: t.content + ev.text } : t))
            );
          } else if (ev.type === "replace") {
            setTurns((prev) =>
              prev.map((t) => (t.id === asstTurn.id ? { ...t, content: ev.text } : t))
            );
          } else if (ev.type === "done") {
            if (ev.payload.session_id) {
              sessionIdRef.current = ev.payload.session_id;
            }
            setTurns((prev) =>
              prev.map((t) =>
                t.id === asstTurn.id
                  ? {
                      ...t,
                      streaming: false,
                      done: ev.payload,
                      turnDbId: ev.payload.turn_id ?? null,
                      content: ev.payload.final_answer ?? t.content,
                    }
                  : t
              )
            );
          } else if (ev.type === "error") {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === asstTurn.id ? { ...t, streaming: false, error: ev.message } : t
              )
            );
            setError(ev.message);
          }
        },
      });

      setStreaming(false);
      abortRef.current = null;
    },
    [streaming, turns]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const sendFeedback = useCallback(
    async (turn: HaruruTurn, value: "up" | "down", comment?: string) => {
      if (!turn.turnDbId) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("agent_turns")
        .update({ feedback: value, feedback_comment: comment ?? null })
        .eq("id", turn.turnDbId);
      if (!error) {
        setTurns((prev) => prev.map((t) => (t.id === turn.id ? { ...t, feedback: value } : t)));
      }
    },
    []
  );

  const reset = useCallback(() => {
    setTurns([]);
    sessionIdRef.current = undefined;
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("agent_turns")
      .select("id, role, content, turn_index, feedback")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true });
    if (error || !data) return;
    sessionIdRef.current = sessionId;
    setTurns(
      data.map((r) => ({
        id: genId(),
        role: r.role as "user" | "assistant",
        content: r.content ?? "",
        turnDbId: r.role === "assistant" ? (r.id as number) : undefined,
        feedback: (r.feedback as "up" | "down" | null | undefined) ?? null,
        streaming: false,
      }))
    );
  }, []);

  return { turns, streaming, error, ask, stop, sendFeedback, reset, loadSession };
}

export interface HaruruRecentSession {
  session_id: string;
  title: string | null;
  last_active_at: string;
  turn_count: number;
}

export async function fetchRecentSessions(limit = 10): Promise<HaruruRecentSession[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("agent_sessions")
    .select("session_id, title, last_active_at, turn_count")
    .order("last_active_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as HaruruRecentSession[];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("agent_sessions").delete().eq("session_id", sessionId);
  if (error) throw new Error(error.message);
}
