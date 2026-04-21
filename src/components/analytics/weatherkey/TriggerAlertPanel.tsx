"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import TriggerRow from "./TriggerRow";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";
import { useTriggersTodayTomorrow } from "./_hooks/useTriggersTodayTomorrow";
import { TRIGGER_PRIORITY, type TriggerName } from "./_tokens";
import type { CurrentSeasonInfo, TriggerDay, WeatherSource } from "./_types";

const SOURCE_LABEL: Record<WeatherSource, string> = {
  asos: "실측",
  forecast_short: "단기예보",
  forecast_mid: "중기예보",
  era5: "ERA5",
};

const COMPOUND_SUBS: TriggerName[] = ["cold_shock", "first_freeze"];

/**
 * 오늘 발동 우선순위 + compound 병합.
 * compound=true이면 primary에 compound만, subs로 cold_shock/first_freeze 표기.
 */
function firedToday(row: TriggerDay | null): {
  primary: TriggerName[];
  compoundSubs: TriggerName[];
} {
  if (!row) return { primary: [], compoundSubs: [] };
  const flags = row as unknown as Record<TriggerName, boolean | null>;
  const isFired = (k: TriggerName) => flags[k] === true;

  if (isFired("compound")) {
    const subs = COMPOUND_SUBS.filter(isFired);
    const others = TRIGGER_PRIORITY.filter(
      (k) => k !== "compound" && !COMPOUND_SUBS.includes(k) && isFired(k)
    );
    return { primary: ["compound", ...others], compoundSubs: subs };
  }
  return { primary: TRIGGER_PRIORITY.filter(isFired), compoundSubs: [] };
}

function todayDetail(trigger: TriggerName, row: TriggerDay): string | undefined {
  switch (trigger) {
    case "cold_shock":
      return row.tmin_delta != null ? `Δ ${row.tmin_delta.toFixed(1)}℃ · 25시즌 2.68×` : undefined;
    case "compound":
      return row.temp_min != null ? `최저 ${row.temp_min.toFixed(1)}℃` : undefined;
    case "first_freeze":
      return row.temp_min != null
        ? `최저 ${row.temp_min.toFixed(1)}℃ · 시즌 첫 영하`
        : "시즌 첫 영하";
    case "search_spike_hotpack":
      return row.max_keyword_ratio != null
        ? `"핫팩" ${row.max_keyword_ratio.toFixed(2)}×`
        : undefined;
    case "search_spike_any":
      return row.spiked_keywords
        ? row.spiked_keywords
        : row.max_keyword_ratio != null
          ? `최대 ${row.max_keyword_ratio.toFixed(2)}×`
          : undefined;
    default:
      return undefined;
  }
}

interface Props {
  seasonInfo?: CurrentSeasonInfo | null;
  nextSeason?: CurrentSeasonInfo | null;
}

function formatDateKorean(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function TriggerAlertPanel({ seasonInfo, nextSeason }: Props = {}) {
  const { data, loading, error } = useTriggersTodayTomorrow();
  const { highlighted, toggleHighlight } = useHighlightQuery();
  const isOffSeason = seasonInfo != null && seasonInfo.status !== "active";
  const daysToNext = daysUntil(nextSeason?.start_date);

  if (loading) {
    return (
      <Card className="h-[220px]">
        <CardContent className="flex h-full flex-col gap-2 p-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-[220px]">
        <CardContent className="text-destructive flex h-full items-center p-4 text-sm">
          {error}
        </CardContent>
      </Card>
    );
  }

  const { primary, compoundSubs } = firedToday(data.today);
  const tmr = data.tomorrow;
  const tmrFired = tmr && (tmr.cold_shock_possible || tmr.first_freeze_possible);
  const forecastSource = tmr?.forecast_source ? SOURCE_LABEL[tmr.forecast_source] : "";
  const forecastTemp =
    tmr?.forecast_temp_min != null ? `${tmr.forecast_temp_min.toFixed(1)}℃` : null;

  return (
    <Card className="h-[220px]">
      <CardContent className="flex h-full flex-col gap-1.5 overflow-auto p-3">
        {isOffSeason && (
          <div className="text-muted-foreground border-muted-foreground/30 rounded border border-dashed px-2 py-1 text-[10px] leading-tight">
            🍂 <span className="font-medium">비시즌</span> · 현재 보는 시즌:{" "}
            <span className="font-medium">{seasonInfo?.season ?? "–"}</span>(
            {seasonInfo?.status === "closed" ? "종료" : "대기"})
            {nextSeason && (
              <>
                {" · "}다음: <span className="font-medium">{nextSeason.season}</span>{" "}
                {formatDateKorean(nextSeason.start_date)}
                {daysToNext != null && daysToNext > 0 && ` (D-${daysToNext})`}
              </>
            )}
          </div>
        )}
        <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          오늘
        </div>
        {data.today == null ? (
          <div className="text-muted-foreground text-xs">데이터 없음</div>
        ) : primary.length === 0 ? (
          <div className="text-muted-foreground text-xs">발동 없음 · 기저선 유지</div>
        ) : (
          <div className="flex flex-col gap-1">
            {primary.map((t) => (
              <TriggerRow
                key={`today-${t}`}
                trigger={t}
                variant="today"
                detail={data.today ? todayDetail(t, data.today) : undefined}
                subTriggers={t === "compound" ? compoundSubs : undefined}
                onClick={data.today?.date ? () => toggleHighlight(data.today!.date!) : undefined}
                isHighlighted={!!data.today?.date && highlighted === data.today.date}
              />
            ))}
          </div>
        )}

        <div className="text-muted-foreground mt-1 text-[10px] font-medium tracking-wide uppercase">
          내일 (예보 추정)
        </div>
        {!tmr ? (
          <div className="text-muted-foreground text-xs">예보 없음</div>
        ) : !tmrFired ? (
          <div className="text-muted-foreground text-xs">특이 없음</div>
        ) : (
          <div className="flex flex-col gap-1">
            {tmr.cold_shock_possible && (
              <TriggerRow
                trigger="cold_shock"
                variant="tomorrow"
                detail={forecastTemp ? `예보 ${forecastTemp} · ${forecastSource}` : undefined}
                onClick={() => toggleHighlight(tmr.date)}
                isHighlighted={highlighted === tmr.date}
              />
            )}
            {tmr.first_freeze_possible && (
              <TriggerRow
                trigger="first_freeze"
                variant="tomorrow"
                detail={forecastTemp ? `예보 ${forecastTemp}` : undefined}
                onClick={() => toggleHighlight(tmr.date)}
                isHighlighted={highlighted === tmr.date}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
