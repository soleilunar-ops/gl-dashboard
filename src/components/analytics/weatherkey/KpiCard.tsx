"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DeltaTone = "up" | "down" | "neutral" | "none";

interface Props {
  label: string;
  value: string;
  delta?: {
    text: string;
    tone: DeltaTone;
  };
  hint?: string;
}

// + / 빠름 / 강화 = 초록(up), − / 늦음 / 약화 = 빨강(down), 동일 = 노랑(neutral)
const TONE_STYLE: Record<DeltaTone, string> = {
  up: "text-emerald-600",
  down: "text-red-600",
  neutral: "text-amber-500",
  none: "text-muted-foreground",
};

export default function KpiCard({ label, value, delta, hint }: Props) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className="text-foreground text-base font-bold tracking-tight">{label}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        <div className="mt-2 flex flex-col items-center gap-0.5">
          {delta && (
            <span className={cn("text-[11px] tabular-nums", TONE_STYLE[delta.tone])}>
              {delta.text}
            </span>
          )}
          {hint && <span className="text-muted-foreground truncate text-[11px]">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
