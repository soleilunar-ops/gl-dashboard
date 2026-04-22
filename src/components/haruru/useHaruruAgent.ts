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

let nextId = 1;
const genId = () => `t${nextId++}`;

export function useHaruruAgent() {
  const [turns, setTurns] = useState<HaruruTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string): Promise<void> => {
      const q = question.trim();
      if (!q || streaming) return;

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
        question: q,
        sessionId: sessionIdRef.current,
        userId: session.user?.id,
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
    [streaming]
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

  return { turns, streaming, error, ask, stop, sendFeedback, reset };
}
