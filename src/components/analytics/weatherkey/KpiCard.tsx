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

const TONE_STYLE: Record<DeltaTone, string> = {
  up: "text-[color:var(--hotpack-health-good)]",
  down: "text-destructive",
  neutral: "text-muted-foreground",
  none: "text-muted-foreground",
};

export default function KpiCard({ label, value, delta, hint }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          {delta && (
            <span className={cn("text-xs tabular-nums", TONE_STYLE[delta.tone])}>{delta.text}</span>
          )}
          {hint && <span className="text-muted-foreground truncate text-[10px]">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
