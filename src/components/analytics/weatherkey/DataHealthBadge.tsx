"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataHealth, type HealthLevel } from "./_hooks/useDataHealth";

const LEVEL_STYLE: Record<HealthLevel, string> = {
  good: "bg-[color:var(--hotpack-health-good)]/15 text-[color:var(--hotpack-health-good)] border-[color:var(--hotpack-health-good)]/30",
  warn: "bg-[color:var(--hotpack-health-warn)]/15 text-[color:var(--hotpack-health-warn)] border-[color:var(--hotpack-health-warn)]/30",
  bad: "bg-destructive/10 text-destructive border-destructive/30",
};

const LEVEL_DOT: Record<HealthLevel, string> = {
  good: "bg-[color:var(--hotpack-health-good)]",
  warn: "bg-[color:var(--hotpack-health-warn)]",
  bad: "bg-destructive",
};

const LEVEL_TEXT: Record<HealthLevel, string> = {
  good: "데이터 정상",
  warn: "지연 감지",
  bad: "점검 필요",
};

/**
 * 상단바 건강도 배지. 가장 늦은 source 기준.
 * 호버 시 네이티브 title로 소스별 상세 표시 (향후 shadcn Tooltip 도입 가능).
 */
export default function DataHealthBadge() {
  const { data, loading } = useDataHealth();

  if (loading) return <Skeleton className="h-6 w-24" />;

  const tooltip = data.freshness
    .map((f) => `${f.source ?? "?"}: ${f.days_behind ?? "?"}일 (${f.latest_date ?? "-"})`)
    .join("\n");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        LEVEL_STYLE[data.level]
      )}
      title={tooltip}
      role="status"
      aria-label={`데이터 건강도 ${LEVEL_TEXT[data.level]}`}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", LEVEL_DOT[data.level])} />
      {LEVEL_TEXT[data.level]}
      {data.worstDaysBehind != null && data.worstDaysBehind > 0 && (
        <span className="tabular-nums">· {data.worstDaysBehind}일</span>
      )}
    </div>
  );
}
