"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

// 절대 상태 라벨 (배수>1인 것만 노출)
const STATE_LABEL: Record<StateKey, string> = {
  cold_wave: "한파",
  freeze: "영하일",
  snow: "강설",
  cold_and_big_diff: "선선+큰 일교차",
};
const STATE_LEVEL: Record<StateKey, "critical" | "high" | "medium"> = {
  cold_wave: "critical",
  freeze: "high",
  snow: "high",
  cold_and_big_diff: "medium",
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
  /** 종류별 접기/펼치기 상태 — 기본 모두 펼침 */
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => openKeys[k] !== false;
  const toggleOpen = (k: string) => setOpenKeys((prev) => ({ ...prev, [k]: prev[k] === false }));

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

  // compound에 흡수된 first_freeze처럼 실제 event 카드가 0개면 섹션 숨김
  const visibleTriggers = TRIGGER_PRIORITY.filter((key) => {
    const events = eventsByTrigger.get(key) ?? [];
    return events.length > 0;
  });

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <div className="text-base font-semibold">시즌 날씨 경보 이력</div>
          <div className="text-muted-foreground text-sm">전날 대비 날씨·판매 변화</div>
        </div>

        <SelectedDayDetail season={season} />

        {visibleTriggers.length === 0 && stateSections.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            시즌 내 경보 없음
          </div>
        ) : visibleTriggers.length > 0 ? (
          <div className="flex flex-col gap-4">
            {visibleTriggers.map((key) => {
              const events = eventsByTrigger.get(key) ?? [];
              const { level } = TRIGGER_COLORS[key];
              const open = isOpen(key);

              return (
                <div key={key} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleOpen(key)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span className="text-sm font-semibold">{TRIGGER_LABELS[key]}</span>
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground ml-auto h-4 w-4 transition-transform",
                        open && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>

                  {open ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {stateSections.length > 0 && (
          <div className="flex flex-col gap-4">
            {stateSections.map((s) => {
              const level = STATE_LEVEL[s.key];
              const openKey = `state-${s.key}`;
              const open = isOpen(openKey);
              return (
                <div key={s.key} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleOpen(openKey)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span className="text-sm font-semibold">{STATE_LABEL[s.key]}</span>
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground ml-auto h-4 w-4 transition-transform",
                        open && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>

                  {open ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
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
        "flex flex-col items-center gap-1 rounded-md border p-3 text-center transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : cn("bg-background hover:bg-muted/50", borderClass)
      )}
    >
      <div className="text-sm font-medium tabular-nums">{formatDate(ev.date)}</div>

      {/* 날씨 */}
      <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
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
      <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
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
        "flex flex-col items-center gap-1 rounded-md border p-3 text-center transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : cn("bg-background hover:bg-muted/50", borderClass)
      )}
    >
      <div className="text-sm font-medium tabular-nums">{formatDate(ev.date)}</div>
      <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
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
      <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
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
