"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  encodeRefPlaceholders,
  splitBodyAndCitations,
  splitByRefPlaceholders,
} from "@/lib/haruru/markdownRenderer";
import type { HaruruTurn } from "./useHaruruAgent";
import { AxisChip } from "./AxisChip";

interface HaruruMessageProps {
  turn: HaruruTurn;
  onFeedback?: (turn: HaruruTurn, value: "up" | "down", comment?: string) => void;
}

function RefBadge({ source, refId }: { source: "sql" | "rag"; refId: string }) {
  return (
    <sup
      title={`${source}.${refId}`}
      className="ml-0.5 inline-flex cursor-help items-center rounded bg-orange-100 px-1 text-[10px] font-medium text-orange-700 hover:bg-orange-200"
    >
      {source}.{refId.split(".").pop()}
    </sup>
  );
}

/** React node를 재귀 순회하며 string 노드 안의 REF placeholder만 치환 */
function processNode(node: ReactNode, keyPrefix: string): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "number") return node;
  if (typeof node === "string") {
    const segments = splitByRefPlaceholders(node);
    if (segments.length === 1 && segments[0].kind === "text") return node;
    return segments.map((seg, i) =>
      seg.kind === "text" ? (
        <span key={`${keyPrefix}-${i}`}>{seg.value}</span>
      ) : (
        <RefBadge key={`${keyPrefix}-${i}`} source={seg.source} refId={seg.ref} />
      )
    );
  }
  if (Array.isArray(node)) {
    return node.map((n, i) => (
      <span key={`${keyPrefix}-${i}`}>{processNode(n, `${keyPrefix}-${i}`)}</span>
    ));
  }
  return node;
}

function RenderTextWithRefs({ children }: { children?: ReactNode }) {
  return <>{processNode(children, "r")}</>;
}

const mdComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-2 leading-relaxed text-gray-800">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-orange-700">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="text-gray-700 italic">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </em>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-4 mb-2 text-base font-bold text-gray-900">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-3 mb-1.5 text-[15px] font-semibold text-gray-900">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold text-gray-800">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </h3>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-gray-800">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-gray-800">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </li>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-3 overflow-x-auto">
      <table className="min-w-full border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-orange-50 text-gray-700">{children}</thead>
  ),
  tbody: ({ children }: { children?: ReactNode }) => (
    <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="hover:bg-orange-50/40">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-3 py-2 text-gray-800">
      <RenderTextWithRefs>{children}</RenderTextWithRefs>
    </td>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-2 border-l-4 border-orange-300 bg-orange-50/40 py-1.5 pl-3 text-gray-700">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-gray-800">
      {children}
    </code>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
};

export function HaruruMessage({ turn, onFeedback }: HaruruMessageProps) {
  const [showCitations, setShowCitations] = useState(false);
  const [downComment, setDownComment] = useState("");
  const [downOpen, setDownOpen] = useState(false);

  if (turn.role === "user") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-orange-100 px-4 py-2 text-sm whitespace-pre-wrap text-gray-800">
          {turn.content}
        </div>
      </div>
    );
  }

  // body에서 legacy "--- 근거:" 블록은 제거하고, 인용 리스트는 turn.done.citations에서 가져와 UI로 렌더
  const { body } = splitBodyAndCitations(turn.content);
  const encoded = encodeRefPlaceholders(body);
  const citationList = turn.done?.citations;
  const hasRagCitations = (citationList?.rag?.length ?? 0) > 0;
  const hasSqlCitations = (citationList?.sql ?? 0) > 0;

  return (
    <div className="mb-4 flex justify-start">
      <div
        className={cn(
          "max-w-[95%] rounded-2xl border bg-white px-5 py-3 text-[15px] leading-relaxed text-gray-800 shadow-sm",
          turn.error && "border-red-200 bg-red-50"
        )}
      >
        {turn.error ? (
          <div className="text-red-700">⚠️ {turn.error}</div>
        ) : (
          <>
            {turn.done?.axis && (
              <div className="mb-2">
                <AxisChip axis={turn.done.axis} />
              </div>
            )}

            <div className="haruru-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {encoded}
              </ReactMarkdown>
              {turn.streaming && (
                <Loader2 className="inline-block h-3.5 w-3.5 animate-spin text-orange-400" />
              )}
            </div>

            {(hasRagCitations || hasSqlCitations) && (
              <button
                type="button"
                onClick={() => setShowCitations((v) => !v)}
                className="mt-3 text-xs text-gray-500 hover:text-gray-800"
              >
                {showCitations ? "근거 숨기기" : "근거 보기"}
              </button>
            )}
            {showCitations && (
              <div className="mt-2 space-y-1 rounded bg-gray-50 p-2.5 text-[11px] text-gray-600">
                {hasSqlCitations && (
                  <div>
                    <span className="font-medium text-gray-700">SQL</span>{" "}
                    <span>{citationList!.sql}행 조회</span>
                  </div>
                )}
                {hasRagCitations && (
                  <div>
                    <span className="font-medium text-gray-700">RAG</span>{" "}
                    <span>{citationList!.rag!.join(", ")}</span>
                  </div>
                )}
              </div>
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
