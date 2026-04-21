"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Snowflake, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";
import { useSeasonDaily } from "./_hooks/useSeasonDaily";
import { useSeasonTriggerEffects } from "./_hooks/useSeasonTriggerEffects";
import { useSeasonTriggerHistory, type TriggerEvent } from "./_hooks/useSeasonTriggerHistory";
import { TRIGGER_COLORS, TRIGGER_LABELS, TRIGGER_PRIORITY, type TriggerName } from "./_tokens";
import type { SeasonDaily, TriggerEffect } from "./_types";

const ICONS: Record<TriggerName, LucideIcon> = {
  cold_shock: Zap,
  compound: AlertTriangle,
  first_freeze: Snowflake,
  search_spike_hotpack: TrendingUp,
  search_spike_any: TrendingUp,
};

const LEVEL_TEXT: Record<string, string> = {
  critical: "text-[color:var(--hotpack-trigger-critical)]",
  high: "text-[color:var(--hotpack-trigger-high)]",
  medium: "text-[color:var(--hotpack-trigger-medium)]",
};

const LEVEL_BORDER: Record<string, string> = {
  critical: "border-[color:var(--hotpack-trigger-critical)]/40",
  high: "border-[color:var(--hotpack-trigger-high)]/40",
  medium: "border-[color:var(--hotpack-trigger-medium)]/40",
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  season: string | null;
}

type DailyMetric = { temp_min: number | null; units_sold: number | null };

function rowToMetric(r: SeasonDaily): DailyMetric {
  return { temp_min: r.temp_min, units_sold: r.units_sold };
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`;
}

function formatUnits(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function TriggerHistoryPanel({ season }: Props) {
  const { data: effects, loading: effLoading } = useSeasonTriggerEffects(season);
  const { data: history, loading: histLoading } = useSeasonTriggerHistory(season);
  const { data: daily, loading: dailyLoading } = useSeasonDaily(season);
  const { highlighted, toggleHighlight } = useHighlightQuery();

  const byKey = useMemo(() => {
    const m = new Map<TriggerName, TriggerEffect>();
    for (const e of effects) {
      if (e.trigger_key && e.trigger_key in TRIGGER_COLORS) {
        m.set(e.trigger_key as TriggerName, e);
      }
    }
    return m;
  }, [effects]);

  const eventsByTrigger = useMemo(() => {
    const m = new Map<TriggerName, TriggerEvent[]>();
    for (const ev of history) {
      if (!m.has(ev.trigger)) m.set(ev.trigger, []);
      m.get(ev.trigger)!.push(ev);
    }
    for (const list of m.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  }, [history]);

  const dailyLookup = useMemo(() => {
    const m = new Map<string, DailyMetric>();
    for (const r of daily) {
      if (r.date) m.set(r.date, rowToMetric(r));
    }
    return m;
  }, [daily]);

  const loading = effLoading || histLoading || dailyLoading;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!season) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">
          시즌을 선택해주세요.
        </CardContent>
      </Card>
    );
  }

  const totalFired = Array.from(byKey.values()).reduce((acc, e) => acc + (e.fired_days ?? 0), 0);

  const visibleTriggers = TRIGGER_PRIORITY.filter((key) => {
    const e = byKey.get(key);
    const events = eventsByTrigger.get(key) ?? [];
    return (e?.fired_days ?? events.length) > 0;
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-base font-semibold">시즌 트리거 이력</div>
            <div className="text-muted-foreground text-sm">
              <span className="font-medium">{season}</span> · 총{" "}
              <span className="text-foreground font-semibold">{totalFired}일</span> 발동 · 각 카드 =
              전날 대비 날씨·판매 변화
            </div>
          </div>
        </div>

        {visibleTriggers.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            시즌 내 발동 트리거 없음
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visibleTriggers.map((key) => {
              const e = byKey.get(key);
              const events = eventsByTrigger.get(key) ?? [];
              const firedDays = e?.fired_days ?? events.length;
              const { level } = TRIGGER_COLORS[key];
              const Icon = ICONS[key];

              return (
                <div key={key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4 shrink-0", LEVEL_TEXT[level])} aria-hidden />
                    <span className="text-sm font-semibold">{TRIGGER_LABELS[key]}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {firedDays}일{e?.multiplier != null && ` · 평균 ${e.multiplier.toFixed(2)}배`}
                      {e?.precision_pct != null && ` · 정밀도 ${Math.round(e.precision_pct)}%`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                    {events.map((ev) => {
                      const curr = dailyLookup.get(ev.date);
                      const prev = dailyLookup.get(addDaysIso(ev.date, -1));
                      const isActive = highlighted === ev.date;
                      return (
                        <EventCard
                          key={`${key}-${ev.date}`}
                          ev={ev}
                          curr={curr}
                          prev={prev}
                          trigger={key}
                          isActive={isActive}
                          borderClass={LEVEL_BORDER[level]}
                          onClick={() => toggleHighlight(ev.date)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-muted-foreground mt-1 rounded border border-dashed px-3 py-1.5 text-xs leading-relaxed">
          💡 정밀도 = 발동 시 판매 증가로 이어진 비율 · Δ = 전날 대비 · 카드 클릭 시 하이라이트
        </div>
      </CardContent>
    </Card>
  );
}

function EventCard({
  ev,
  curr,
  prev,
  trigger,
  isActive,
  borderClass,
  onClick,
}: {
  ev: TriggerEvent;
  curr: DailyMetric | undefined;
  prev: DailyMetric | undefined;
  trigger: TriggerName;
  isActive: boolean;
  borderClass: string;
  onClick: () => void;
}) {
  // 전날 대비
  const tempDelta =
    curr?.temp_min != null && prev?.temp_min != null
      ? curr.temp_min - prev.temp_min
      : (ev.tmin_delta ?? null);
  const salesDeltaPct =
    curr?.units_sold != null && prev?.units_sold
      ? ((curr.units_sold - prev.units_sold) / prev.units_sold) * 100
      : null;

  const isSurge = trigger === "search_spike_hotpack" || trigger === "search_spike_any";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        "flex flex-col gap-1 rounded-md border p-2.5 text-left transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : cn("bg-background hover:bg-muted/50", borderClass)
      )}
    >
      <div className="text-sm font-medium tabular-nums">{formatDate(ev.date)}</div>

      {/* 날씨 */}
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-base font-semibold">
          {curr?.temp_min != null ? `${curr.temp_min.toFixed(1)}℃` : "–"}
        </span>
        {tempDelta != null && (
          <span
            className={cn(
              "text-xs",
              tempDelta < 0
                ? "font-medium text-[color:var(--hotpack-trigger-critical)]"
                : "text-muted-foreground"
            )}
          >
            Δ{tempDelta >= 0 ? "+" : ""}
            {tempDelta.toFixed(1)}
          </span>
        )}
      </div>

      {/* 판매 */}
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm font-medium">{formatUnits(curr?.units_sold)}개</span>
        {salesDeltaPct != null && (
          <span
            className={cn(
              "text-xs font-medium",
              salesDeltaPct > 0
                ? "text-[color:var(--hotpack-trigger-high)]"
                : salesDeltaPct < 0
                  ? "text-muted-foreground"
                  : "text-muted-foreground"
            )}
          >
            {salesDeltaPct >= 0 ? "+" : ""}
            {salesDeltaPct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* 검색 급등 시 보조 정보 */}
      {isSurge && (ev.max_keyword_ratio != null || ev.spiked_keywords) && (
        <div className="text-muted-foreground text-[11px] tabular-nums">
          {ev.max_keyword_ratio != null && (
            <span className="font-medium">{ev.max_keyword_ratio.toFixed(2)}×</span>
          )}
          {ev.spiked_keywords && <span className="ml-1 truncate">{ev.spiked_keywords}</span>}
        </div>
      )}
    </button>
  );
}
