"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CloudSnow,
  Info,
  Snowflake,
  Thermometer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import SelectedDayDetail from "./SelectedDayDetail";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";
import { useSeasonDaily } from "./_hooks/useSeasonDaily";
import {
  useSeasonStateEvents,
  type StateEvent,
  type StateKey,
} from "./_hooks/useSeasonStateEvents";
import { useSeasonStateLift } from "./_hooks/useSeasonStateLift";
import { useSeasonTriggerEffects } from "./_hooks/useSeasonTriggerEffects";
import { useSeasonTriggerHistory, type TriggerEvent } from "./_hooks/useSeasonTriggerHistory";
import { TRIGGER_COLORS, TRIGGER_LABELS, TRIGGER_PRIORITY, type TriggerName } from "./_tokens";
import type { SeasonDaily, TriggerEffect } from "./_types";

const TRIGGER_CRITERIA: Record<TriggerName, string> = {
  cold_shock: "전날 대비 최저기온이 6℃ 이상 하락한 날",
  compound: "같은 날 '갑작스러운 추위'와 '첫 영하'가 동시 발동",
  first_freeze: "시즌 첫 최저기온 0℃ 미만을 기록한 날",
  search_spike_hotpack: "'핫팩' 검색량이 최근 7일 평균의 1.5배 이상",
  search_spike_any: "관련 키워드 중 하나라도 최근 7일 평균의 1.5배 이상",
};

// 절대 상태 트리거 (배수>1인 것만 노출)
const STATE_LABEL: Record<StateKey, string> = {
  cold_wave: "한파",
  freeze: "영하일",
  snow: "강설",
  cold_and_big_diff: "선선+큰 일교차",
};
const STATE_CRITERIA: Record<StateKey, string> = {
  cold_wave: "최저기온 −12℃ 이하",
  freeze: "최고기온 0℃ 미만",
  snow: "적설량 > 0",
  cold_and_big_diff: "최고기온 0~10℃ 이고 일교차 8~12℃",
};
const STATE_ICONS: Record<StateKey, LucideIcon> = {
  cold_wave: Snowflake,
  freeze: Snowflake,
  snow: CloudSnow,
  cold_and_big_diff: Thermometer,
};
const STATE_LEVEL: Record<StateKey, "critical" | "high" | "medium"> = {
  cold_wave: "critical",
  freeze: "high",
  snow: "high",
  cold_and_big_diff: "medium",
};

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
  const { data: stateEvents, loading: stateEvLoading } = useSeasonStateEvents(season);
  const { data: stateLift, loading: stateLiftLoading } = useSeasonStateLift(season);
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

  // 절대 상태: 배수 > 1인 것만 노출.
  // cold_and_big_diff는 신호 약함(1.83) → 전날 대비 판매 증가한 날만 필터로 노이즈 제거
  const stateSections = useMemo(() => {
    const liftMap = new Map<string, { fired: number | null; mult: number | null }>();
    let seasonAvg = 0;
    for (const r of stateLift) {
      if (!r.state_key) continue;
      liftMap.set(r.state_key, {
        fired: r.fired_days,
        mult: r.multiplier != null ? Number(r.multiplier) : null,
      });
      if (r.avg_season != null) seasonAvg = Number(r.avg_season);
    }
    const keys: StateKey[] = ["cold_wave", "freeze", "snow", "cold_and_big_diff"];
    return keys
      .map((key) => {
        const lift = liftMap.get(key);
        let events = stateEvents[key];
        // cold_and_big_diff는 신호 약함 → "전날 대비 증가 AND 판매 ≥ 시즌 평균"
        if (key === "cold_and_big_diff") {
          events = events.filter(
            (ev) =>
              ev.units_sold != null &&
              ev.prev_units != null &&
              ev.units_sold > ev.prev_units &&
              ev.units_sold >= seasonAvg
          );
        }
        return {
          key,
          firedDays: lift?.fired ?? events.length,
          filteredDays: events.length,
          multiplier: lift?.mult ?? null,
          events,
        };
      })
      .filter((s) => s.multiplier != null && s.multiplier > 1 && s.events.length > 0)
      .sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0));
  }, [stateLift, stateEvents]);

  const loading = effLoading || histLoading || dailyLoading || stateEvLoading || stateLiftLoading;

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

  // compound에 흡수된 first_freeze처럼 실제 event 카드가 0개면 섹션 숨김
  const visibleTriggers = TRIGGER_PRIORITY.filter((key) => {
    const events = eventsByTrigger.get(key) ?? [];
    return events.length > 0;
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-base font-semibold">시즌 날씨 경보 이력</div>
            <div className="text-muted-foreground text-sm">
              <span className="font-medium">{season}</span> · 총{" "}
              <span className="text-foreground font-semibold">{totalFired}일</span> 경보 · 각 카드 =
              전날 대비 날씨·판매 변화
            </div>
          </div>
        </div>

        <SelectedDayDetail season={season} />

        {visibleTriggers.length === 0 && stateSections.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            시즌 내 경보 없음
          </div>
        ) : visibleTriggers.length > 0 ? (
          <div className="flex flex-col gap-4">
            {visibleTriggers.map((key) => {
              const e = byKey.get(key);
              const events = eventsByTrigger.get(key) ?? [];
              const firedDays = e?.fired_days ?? events.length;
              const { level } = TRIGGER_COLORS[key];
              const Icon = ICONS[key];

              return (
                <div key={key} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className={cn("h-4 w-4 shrink-0", LEVEL_TEXT[level])} aria-hidden />
                    <span className="text-sm font-semibold">{TRIGGER_LABELS[key]}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${TRIGGER_LABELS[key]} 기준 보기`}
                          className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center rounded-full"
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 text-xs">
                        <div className="mb-1 font-semibold">{TRIGGER_LABELS[key]} 기준</div>
                        <div className="text-muted-foreground leading-relaxed">
                          {TRIGGER_CRITERIA[key]}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {firedDays}일{e?.multiplier != null && ` · 평균 ${e.multiplier.toFixed(2)}배`}
                      {e?.precision_pct != null && ` · 적중률 ${Math.round(e.precision_pct)}%`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
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
        ) : null}

        {/* 절대 상태 트리거 (배수>1) */}
        {stateSections.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="text-muted-foreground border-t pt-4 text-[11px] font-medium tracking-wide uppercase">
              절대 상태 트리거 (배수 &gt; 1)
            </div>
            {stateSections.map((s) => {
              const Icon = STATE_ICONS[s.key];
              const level = STATE_LEVEL[s.key];
              return (
                <div key={s.key} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className={cn("h-4 w-4 shrink-0", LEVEL_TEXT[level])} aria-hidden />
                    <span className="text-sm font-semibold">{STATE_LABEL[s.key]}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${STATE_LABEL[s.key]} 기준 보기`}
                          className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center rounded-full"
                        >
                          <Info className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 text-xs">
                        <div className="mb-1 font-semibold">{STATE_LABEL[s.key]} 기준</div>
                        <div className="text-muted-foreground leading-relaxed">
                          {STATE_CRITERIA[s.key]}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {s.key === "cold_and_big_diff"
                        ? `총 ${s.firedDays}일 중 유효 ${s.filteredDays}일 (전날 대비 ↑ · 판매 ≥ 시즌 평균)`
                        : `${s.firedDays}일`}
                      {s.multiplier != null && ` · 평균 ${s.multiplier.toFixed(2)}배`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
                    {s.events.map((ev) => {
                      const curr = dailyLookup.get(ev.date);
                      const prev = dailyLookup.get(addDaysIso(ev.date, -1));
                      const isActive = highlighted === ev.date;
                      return (
                        <StateEventCard
                          key={`${s.key}-${ev.date}`}
                          ev={ev}
                          curr={curr}
                          prev={prev}
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
          💡 <b>급증 감지</b>(전날 대비 변화) + <b>절대 상태</b>(그 날씨 자체) 둘 다 배수 &gt; 1인
          트리거만 노출. 카드 클릭 시 상단에 선택일 상세 표시
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
            {tempDelta >= 0 ? "▲+" : "▼"}
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

/**
 * 절대 상태 이벤트 카드 — EventCard와 유사하나 전일 대비 temp/sales만 표시 (추가 surge 정보 없음).
 */
function StateEventCard({
  ev,
  curr,
  prev,
  isActive,
  borderClass,
  onClick,
}: {
  ev: StateEvent;
  curr: DailyMetric | undefined;
  prev: DailyMetric | undefined;
  isActive: boolean;
  borderClass: string;
  onClick: () => void;
}) {
  const tempDelta =
    curr?.temp_min != null && prev?.temp_min != null ? curr.temp_min - prev.temp_min : null;
  const salesDeltaPct =
    curr?.units_sold != null && prev?.units_sold
      ? ((curr.units_sold - prev.units_sold) / prev.units_sold) * 100
      : null;
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
            {tempDelta >= 0 ? "▲+" : "▼"}
            {tempDelta.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm font-medium">{formatUnits(curr?.units_sold)}개</span>
        {salesDeltaPct != null && (
          <span
            className={cn(
              "text-xs font-medium",
              salesDeltaPct > 0
                ? "text-[color:var(--hotpack-trigger-high)]"
                : "text-muted-foreground"
            )}
          >
            {salesDeltaPct >= 0 ? "+" : ""}
            {salesDeltaPct.toFixed(0)}%
          </span>
        )}
      </div>
    </button>
  );
}
