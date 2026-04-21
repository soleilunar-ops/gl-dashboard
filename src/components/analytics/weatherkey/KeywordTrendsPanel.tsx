"use client";

import { useMemo } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useKeywordTrends } from "./_hooks/useKeywordTrends";
import { useSeasonTriggerEffects } from "./_hooks/useSeasonTriggerEffects";
import { KEYWORD_COLORS, TRIGGER_LABELS } from "./_tokens";
import type { KeywordDailyWithMa, TriggerEffect } from "./_types";

const SURGE_THRESHOLD = 1.5;

type KeywordSeries = {
  keyword: string;
  category: string | null;
  values: { date: string; y: number; ma: number | null; ratio: number | null }[];
};

function groupByKeyword(rows: KeywordDailyWithMa[]): KeywordSeries[] {
  const map = new Map<string, KeywordSeries>();
  for (const r of rows) {
    if (!r.keyword || !r.trend_date || r.search_index == null) continue;
    if (!map.has(r.keyword)) {
      map.set(r.keyword, { keyword: r.keyword, category: r.category, values: [] });
    }
    map.get(r.keyword)!.values.push({
      date: r.trend_date,
      y: r.search_index,
      ma: r.ma_7d,
      ratio: r.ratio_to_ma,
    });
  }
  for (const s of map.values()) s.values.sort((a, b) => a.date.localeCompare(b.date));
  return Array.from(map.values()).sort((a, b) => a.keyword.localeCompare(b.keyword));
}

interface Props {
  season: string | null;
}

/**
 * 키워드 섹션 — 시계열 차트에서 카드 그리드로 재설계.
 *
 * 구성:
 * - 키워드별 카드(최신 지수 · MA 배수 · 변화 방향 · 60일 sparkline)
 * - 하단: 검색 급등이 판매에 미친 효과 표 (trigger_effects)
 */
export default function KeywordTrendsPanel({ season }: Props) {
  const { data: trends, loading: trendsLoading, error: trendsError } = useKeywordTrends();
  const { data: effects } = useSeasonTriggerEffects(season);

  const series = useMemo(() => groupByKeyword(trends), [trends]);
  const spikeEffects = useMemo(
    () =>
      effects.filter(
        (e): e is TriggerEffect & { trigger_key: "search_spike_hotpack" | "search_spike_any" } =>
          e.trigger_key === "search_spike_hotpack" || e.trigger_key === "search_spike_any"
      ),
    [effects]
  );

  if (trendsLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (trendsError) {
    return (
      <Card>
        <CardContent className="text-destructive p-4 text-sm">{trendsError}</CardContent>
      </Card>
    );
  }

  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">키워드 데이터 없음</CardContent>
      </Card>
    );
  }

  const latestDate = series
    .flatMap((s) => s.values)
    .reduce<string>((acc, v) => (v.date > acc ? v.date : acc), "");

  const surgeCount = series.filter((s) => {
    const last = s.values[s.values.length - 1];
    return last && last.ratio != null && last.ratio >= SURGE_THRESHOLD;
  }).length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-medium">키워드 검색지수 · 최근 60일</div>
            <div className="text-muted-foreground text-[11px]">
              네이버 데이터랩 · 기준일 {latestDate || "–"} · 오늘 급등 {surgeCount}/{series.length}
            </div>
          </div>
          <div className="text-muted-foreground text-[11px]">
            급등 임계 {SURGE_THRESHOLD}× (MA7 대비)
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {series.map((s, idx) => (
            <KeywordCard
              key={s.keyword}
              series={s}
              color={KEYWORD_COLORS[idx % KEYWORD_COLORS.length]}
            />
          ))}
        </div>

        <SearchSpikeEffectTable effects={spikeEffects} season={season} />
      </CardContent>
    </Card>
  );
}

function KeywordCard({ series, color }: { series: KeywordSeries; color: string }) {
  const last = series.values[series.values.length - 1];
  const prev = series.values[Math.max(0, series.values.length - 8)]; // 7일 전
  const direction: "up" | "down" | "flat" =
    last && prev ? (last.y > prev.y + 3 ? "up" : last.y < prev.y - 3 ? "down" : "flat") : "flat";
  const DirIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const dirColor =
    direction === "up"
      ? "text-[color:var(--hotpack-health-good)]"
      : direction === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  const isSurge = last?.ratio != null && last.ratio >= SURGE_THRESHOLD;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border p-2.5",
        isSurge && "ring-2 ring-[color:var(--hotpack-trigger-high)]/40"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <span className="truncate text-xs font-medium">{series.keyword}</span>
        <DirIcon className={cn("ml-auto h-3 w-3", dirColor)} aria-hidden />
      </div>

      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-xl font-semibold">{last?.y.toFixed(0) ?? "–"}</span>
        <span className="text-muted-foreground text-[10px]">지수</span>
      </div>

      <div className="flex items-center gap-2 text-[10px] tabular-nums">
        <span
          className={cn(
            isSurge
              ? "font-medium text-[color:var(--hotpack-trigger-high)]"
              : "text-muted-foreground"
          )}
        >
          MA 대비 {last?.ratio != null ? `${last.ratio.toFixed(2)}×` : "–"}
        </span>
      </div>

      <Sparkline values={series.values.map((v) => v.y)} color={color} accentLastIfSurge={isSurge} />

      {series.category && (
        <div className="text-muted-foreground truncate text-[10px]">#{series.category}</div>
      )}
    </div>
  );
}

function Sparkline({
  values,
  color,
  width = 120,
  height = 32,
  accentLastIfSurge = false,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  accentLastIfSurge?: boolean;
}) {
  if (values.length < 2) {
    return <div className="text-muted-foreground text-[10px]">데이터 부족</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = (values.length - 1) * step;
  const lastY = height - ((values[values.length - 1] - min) / range) * (height - 2) - 1;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <circle
        cx={lastX}
        cy={lastY}
        r={accentLastIfSurge ? 3 : 1.8}
        fill={accentLastIfSurge ? "var(--hotpack-trigger-high)" : color}
      />
    </svg>
  );
}

function SearchSpikeEffectTable({
  effects,
  season,
}: {
  effects: TriggerEffect[];
  season: string | null;
}) {
  if (effects.length === 0) {
    return null;
  }
  return (
    <div className="bg-muted/30 rounded-md border p-3">
      <div className="mb-2 text-xs font-medium">
        키워드 검색 급등 → 판매 효과 ({season ?? "시즌 미선택"})
      </div>
      <div className="grid grid-cols-1 gap-1 text-[11px] md:grid-cols-2">
        {effects.map((e) => {
          const label =
            TRIGGER_LABELS[e.trigger_key as keyof typeof TRIGGER_LABELS] ?? e.trigger_key;
          return (
            <div
              key={e.trigger_key}
              className="bg-background flex items-center justify-between gap-2 rounded border px-2 py-1.5 tabular-nums"
            >
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">
                {e.fired_days ?? 0}일 ·{" "}
                {e.multiplier != null ? `${e.multiplier.toFixed(2)}× 판매` : "–"}
                {e.precision_pct != null && ` · 정밀도 ${Math.round(e.precision_pct)}%`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground mt-2 text-[10px]">
        검색 급등일의 판매 평균이 기저선(직전 기간 평균) 대비 얼마나 증가했는지. 정밀도 = 급등 발동
        시 실제 판매 증가로 이어진 비율.
      </div>
    </div>
  );
}
