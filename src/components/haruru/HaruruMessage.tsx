"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitAnswerSegments, splitBodyAndCitations } from "@/lib/haruru/markdownRenderer";
import type { HaruruTurn } from "./useHaruruAgent";

interface HaruruMessageProps {
  turn: HaruruTurn;
  onFeedback?: (turn: HaruruTurn, value: "up" | "down", comment?: string) => void;
}

export function HaruruMessage({ turn, onFeedback }: HaruruMessageProps) {
  const [showCitations, setShowCitations] = useState(false);
  const [downComment, setDownComment] = useState("");
  const [downOpen, setDownOpen] = useState(false);

  if (turn.role === "user") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-orange-100 px-4 py-2 text-sm text-gray-800">
          {turn.content}
        </div>
      </div>
    );
  }

  // assistant
  const { body, citations } = splitBodyAndCitations(turn.content);
  const segments = splitAnswerSegments(body);

  return (
    <div className="mb-4 flex justify-start">
      <div
        className={cn(
          "max-w-[92%] rounded-2xl border bg-white px-5 py-3 text-[15px] leading-relaxed text-gray-800 shadow-sm",
          turn.error && "border-red-200 bg-red-50"
        )}
      >
        {turn.error ? (
          <div className="text-red-700">⚠️ {turn.error}</div>
        ) : (
          <>
            <div className="whitespace-pre-wrap">
              {segments.map((seg, i) =>
                seg.kind === "text" ? (
                  <span key={i}>{seg.value}</span>
                ) : (
                  <span
                    key={i}
                    title={`${seg.source}.${seg.ref}`}
                    className="mx-0.5 inline-flex cursor-help items-center rounded bg-orange-50 px-1 align-super text-[11px] font-medium text-orange-700"
                  >
                    {seg.source}.{seg.ref.split(".").pop()}
                  </span>
                )
              )}
              {turn.streaming && (
                <Loader2 className="ml-1 inline-block h-3.5 w-3.5 animate-spin text-orange-400" />
              )}
            </div>

            {citations && (
              <button
                type="button"
                onClick={() => setShowCitations((v) => !v)}
                className="mt-3 text-xs text-gray-500 hover:text-gray-800"
              >
                {showCitations ? "근거 숨기기" : "근거 보기"}
              </button>
            )}
            {showCitations && citations && (
              <pre className="mt-2 rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap text-gray-600">
                {citations}
              </pre>
            )}

            {!turn.streaming && !turn.error && onFeedback && (
              <div className="mt-3 flex items-center gap-1 text-gray-400">
                <button
                  type="button"
                  aria-label="답변이 도움이 됐어요"
                  onClick={() => onFeedback(turn, "up")}
                  className={cn(
                    "rounded p-1 hover:bg-gray-100 hover:text-gray-700",
                    turn.feedback === "up" && "text-green-600"
                  )}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="답변이 아쉬워요"
                  onClick={() => {
                    if (turn.feedback === "down") return;
                    setDownOpen(true);
                  }}
                  className={cn(
                    "rounded p-1 hover:bg-gray-100 hover:text-gray-700",
                    turn.feedback === "down" && "text-red-600"
                  )}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {downOpen && (
              <div className="mt-2 rounded border border-gray-200 p-2">
                <textarea
                  value={downComment}
                  onChange={(e) => setDownComment(e.target.value)}
                  placeholder="무엇이 아쉬웠는지 알려주세요 (선택)"
                  className="w-full rounded border border-gray-200 p-1.5 text-xs"
                  rows={2}
                />
                <div className="mt-1.5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDownOpen(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onFeedback?.(turn, "down", downComment || undefined);
                      setDownOpen(false);
                    }}
                    className="rounded bg-orange-500 px-2 py-0.5 text-xs text-white hover:bg-orange-600"
                  >
                    제출
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
