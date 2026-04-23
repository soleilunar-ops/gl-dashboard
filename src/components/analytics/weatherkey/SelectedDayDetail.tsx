"use client";

import { Loader2, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDailyTopSkus } from "./_hooks/useDailyTopSkus";
import { useDayAnalysis } from "./_hooks/useDayAnalysis";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const CATEGORY_LABEL: Record<string, string> = {
  handwarmer: "손난로",
  stick_on: "붙이는",
  shakeable: "흔드는",
};

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${DOW[d.getDay()]})`;
}

function pctChange(cur: number, base: number | null | undefined): number | null {
  if (base == null || base === 0) return null;
  return ((cur - base) / base) * 100;
}

function fmtPct(v: number | null): string {
  if (v == null) return "–";
  return `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function pctClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 30) return "text-[color:var(--hotpack-trigger-critical)]";
  if (v > 0) return "text-[color:var(--hotpack-trigger-high)]";
  return "text-muted-foreground";
}

interface Props {
  season: string | null;
}

/**
 * 경보 이력 / 예보 스캔에서 날짜 클릭 시 나타나는 상세 패널.
 * - 상단 요약: 당일 / 전날 / 시즌 평균 (핫팩 전체 합계)
 * - 하단 TOP3 SKU
 */
export default function SelectedDayDetail({ season }: Props) {
  const { highlighted, setHighlight } = useHighlightQuery();
  const { data, loading, error } = useDailyTopSkus(season, highlighted);
  const aiState = useDayAnalysis(season, highlighted);

  const open = highlighted !== null;
  const vsPrev = pctChange(data.dayTotalUnits, data.prevDayTotalUnits);
  const vsAvg = pctChange(data.dayTotalUnits, data.seasonAvgTotalUnits);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setHighlight(null)}>
      <DialogContent className="max-h-[85vh] max-w-[min(1080px,92vw)] overflow-y-auto sm:max-w-[min(1080px,92vw)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy
              className="h-5 w-5 shrink-0 text-[color:var(--hotpack-trigger-high)]"
              aria-hidden
            />
            {highlighted ? formatDateLong(highlighted) : ""}
          </DialogTitle>
          <DialogDescription>핫팩 전체 판매 · TOP3 SKU 상세</DialogDescription>
        </DialogHeader>

        {/* 상단 요약 — 당일 / 전날 / 시즌 평균 */}
        {loading ? (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="bg-background rounded-md border p-3">
              <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                선택일
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-2xl font-bold">
                  {data.dayTotalUnits.toLocaleString("ko-KR")}
                </span>
                <span className="text-muted-foreground text-sm">개</span>
              </div>
            </div>
            <div className="bg-background rounded-md border p-3">
              <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                전날
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-2xl font-semibold">
                  {data.prevDayTotalUnits != null
                    ? data.prevDayTotalUnits.toLocaleString("ko-KR")
                    : "–"}
                </span>
                <span className="text-muted-foreground text-sm">개</span>
                {vsPrev != null && (
                  <span className={cn("ml-auto text-sm font-semibold", pctClass(vsPrev))}>
                    {fmtPct(vsPrev)}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-background rounded-md border p-3">
              <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                피크 평균 (11/1~2/8)
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-2xl font-semibold">
                  {data.seasonAvgTotalUnits != null
                    ? Math.round(data.seasonAvgTotalUnits).toLocaleString("ko-KR")
                    : "–"}
                </span>
                <span className="text-muted-foreground text-sm">개/일</span>
                {vsAvg != null && (
                  <span className={cn("ml-auto text-sm font-semibold", pctClass(vsAvg))}>
                    {fmtPct(vsAvg)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI 분석 */}
        <div className="mb-4 rounded-md border border-[color:var(--hotpack-trigger-high)]/30 bg-[color:var(--hotpack-trigger-high)]/5 p-3">
          <div className="text-sm leading-relaxed">
            {aiState.kind === "loading" && (
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> AI 맥락 분석 중…
              </div>
            )}
            {aiState.kind === "ready" && <div>{aiState.analysis.body}</div>}
            {aiState.kind === "error" && (
              <div className="text-destructive text-xs">분석 실패: {aiState.message}</div>
            )}
            {aiState.kind === "idle" && (
              <div className="text-muted-foreground text-xs">대기 중…</div>
            )}
          </div>
        </div>

        {/* TOP3 SKU */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <div className="text-destructive text-sm">{error}</div>
        ) : data.rows.length === 0 ? (
          <div className="text-muted-foreground text-sm">해당일 판매 데이터가 없습니다.</div>
        ) : (
          <div>
            <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
              TOP3 SKU
            </div>
            <ol className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {data.rows.map((r, idx) => (
                <li
                  key={r.sku_id}
                  className="bg-background flex flex-col gap-2 rounded-md border p-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground w-4 shrink-0 text-sm font-semibold tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium" title={r.sku_name}>
                      {r.sku_name}
                    </span>
                    {r.category && (
                      <span className="text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                        {CATEGORY_LABEL[r.category] ?? r.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-2xl font-bold">{r.units.toLocaleString("ko-KR")}</span>
                    <span className="text-muted-foreground text-xs">개</span>
                    {r.pct_vs_avg != null && (
                      <span className={cn("ml-auto text-sm font-semibold", pctClass(r.pct_vs_avg))}>
                        vs 평균 {fmtPct(r.pct_vs_avg)}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
                    <span>
                      전날{" "}
                      <span className="text-foreground font-medium">
                        {r.prev_day_units != null ? r.prev_day_units.toLocaleString("ko-KR") : "–"}
                      </span>
                      {r.prev_day_units != null && <span className="ml-0.5">개</span>}
                      {r.pct_vs_prev != null && (
                        <span className={cn("ml-1 font-semibold", pctClass(r.pct_vs_prev))}>
                          {fmtPct(r.pct_vs_prev)}
                        </span>
                      )}
                    </span>
                    <span>·</span>
                    <span>
                      피크 평균 {Math.round(r.season_avg_units).toLocaleString("ko-KR")}개/일
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
