"use client";

import { useEffect, useRef } from "react";
import { HaruruMessage } from "./HaruruMessage";
import type { HaruruTurn } from "./useHaruruAgent";

interface HaruruConversationProps {
  turns: HaruruTurn[];
  onFeedback?: (turn: HaruruTurn, value: "up" | "down", comment?: string) => void;
}

/**
 * 하루루 대화 누적 표시. 새 턴 추가 시 자동 스크롤.
 */
export function HaruruConversation({ turns, onFeedback }: HaruruConversationProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  if (turns.length === 0) return null;

  return (
    <div className="w-full max-w-2xl">
      {turns.map((t) => (
        <HaruruMessage key={t.id} turn={t} onFeedback={onFeedback} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
