"use client";

import { TrendingUp } from "lucide-react";

export type SurgeItem = {
  keyword: string;
  ratio: number;
  colorIndex: number;
  searchIndex: number | null;
};

const KEYWORD_VAR = [
  "var(--hotpack-keyword-1)",
  "var(--hotpack-keyword-2)",
  "var(--hotpack-keyword-3)",
  "var(--hotpack-keyword-4)",
  "var(--hotpack-keyword-5)",
];

interface Props {
  items: SurgeItem[];
  referenceDate: string | null;
}

export default function KeywordSurgeCard({ items, referenceDate }: Props) {
  return (
    <div className="flex h-full w-40 shrink-0 flex-col gap-1.5 rounded-md border p-2">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
        <TrendingUp className="h-3 w-3" aria-hidden /> 급등 TOP3
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
          급등 없음
        </div>
      ) : (
        <ul className="flex-1 space-y-1 text-xs">
          {items.map((it, idx) => (
            <li key={it.keyword} className="flex items-center gap-1.5 rounded border px-1.5 py-1">
              <span className="text-muted-foreground w-3 text-[10px] tabular-nums">{idx + 1}</span>
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{
                  backgroundColor: KEYWORD_VAR[it.colorIndex % KEYWORD_VAR.length],
                }}
              />
              <span className="truncate font-medium">{it.keyword}</span>
              <span className="ml-auto text-[color:var(--hotpack-trigger-high)] tabular-nums">
                {it.ratio.toFixed(2)}×
              </span>
            </li>
          ))}
        </ul>
      )}

      {referenceDate && (
        <div className="text-muted-foreground text-[10px] tabular-nums">기준 {referenceDate}</div>
      )}
    </div>
  );
}
