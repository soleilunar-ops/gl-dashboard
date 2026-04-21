"use client";

import { useEffect, useMemo, useState } from "react";
import { Snowflake, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";
import { useMockDate } from "./_hooks/useMockDate";
import { useTenDayWeather, type TenDayRow } from "./_hooks/useTenDayWeather";
import type { CurrentSeasonInfo, WeatherSource } from "./_types";

// 예보에서 발동 추정 가능한 트리거만 — search_spike_*는 예측 불가, compound는 구성요소 동시발동이라 사실상 스캔 의미 작음.
const COLD_SHOCK_DELTA = -6;

const SOURCE_LABEL: Record<WeatherSource, string> = {
  asos: "실측",
  forecast_short: "단기예보",
  forecast_mid: "중기예보",
  era5: "ERA5",
};

type ScanHit = {
  date: string;
  dDiff: number;
  temp_min: number;
  source: WeatherSource;
  cold_shock: boolean;
  first_freeze: boolean;
  delta: number | null;
};

function isoDate(d: Date): string {
  // 로컬 타임존 기준 — toISOString()은 UTC라 KST 새벽에 전날로 밀림
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(iso: string, now: Date): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const t = new Date(iso);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

function buildScan(rows: TenDayRow[], alreadyHadFreeze: boolean, now: Date): ScanHit[] {
  const today = isoDate(now);
  const sorted = [...rows].sort((a, b) => a.weather_date.localeCompare(b.weather_date));
  let sawFreeze = alreadyHadFreeze;
  const hits: ScanHit[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.weather_date < today) continue;
    if (r.temp_min == null) continue;
    const prev = sorted[i - 1];
    const delta = prev?.temp_min != null ? r.temp_min - prev.temp_min : null;
    const cold_shock = delta != null && delta <= COLD_SHOCK_DELTA;
    const isFreeze = r.temp_min < 0;
    const first_freeze = isFreeze && !sawFreeze;
    if (isFreeze) sawFreeze = true;
    if (cold_shock || first_freeze) {
      hits.push({
        date: r.weather_date,
        dDiff: dayDiff(r.weather_date, now),
        temp_min: r.temp_min,
        source: r.source,
        cold_shock,
        first_freeze,
        delta,
      });
    }
  }
  return hits;
}

function formatDateKorean(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function daysUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

interface Props {
  seasonInfo?: CurrentSeasonInfo | null;
  nextSeason?: CurrentSeasonInfo | null;
}

export default function ForecastTriggerScan({ seasonInfo, nextSeason }: Props = {}) {
  const supabase = useMemo(() => createClient(), []);
  const { data: weather, loading, error } = useTenDayWeather();
  const { highlighted, toggleHighlight } = useHighlightQuery();
  const { getNow } = useMockDate();
  const [alreadyHadFreeze, setAlreadyHadFreeze] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("v_hotpack_season_stats")
        .select("first_freeze")
        .order("season_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setAlreadyHadFreeze(Boolean(data?.first_freeze));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const now = getNow();
  const hits = useMemo(
    () => buildScan(weather, alreadyHadFreeze, now),
    [weather, alreadyHadFreeze, now]
  );
  const isOffSeason = seasonInfo != null && seasonInfo.status !== "active";
  const daysToNext = daysUntil(nextSeason?.start_date, now);

  if (loading) {
    return (
      <Card className="h-[220px]">
        <CardContent className="flex h-full flex-col gap-2 p-3">
          <Skeleton className="h-4 w-40" />
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

  return (
    <Card className="h-[220px]">
      <CardContent className="flex h-full flex-col gap-1.5 overflow-auto p-3">
        {isOffSeason && (
          <div className="text-muted-foreground border-muted-foreground/30 rounded border border-dashed px-2 py-1 text-[10px] leading-tight">
            🍂 <span className="font-medium">비시즌</span>
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
          예보 기반 날씨 경보 · 오늘~10일 후
        </div>
        {hits.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs">
            향후 10일 예보상 경보 없음
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {hits.map((h) => (
              <ForecastHitRow
                key={h.date}
                hit={h}
                isHighlighted={highlighted === h.date}
                onClick={() => toggleHighlight(h.date)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastHitRow({
  hit,
  isHighlighted,
  onClick,
}: {
  hit: ScanHit;
  isHighlighted?: boolean;
  onClick?: () => void;
}) {
  // first_freeze가 희소성 높아 우선 표시 아이콘·색 결정
  const primary = hit.first_freeze ? "first_freeze" : "cold_shock";
  const Icon = primary === "first_freeze" ? Snowflake : Zap;
  const iconColor =
    primary === "first_freeze"
      ? "text-[color:var(--hotpack-trigger-high)]"
      : "text-[color:var(--hotpack-trigger-critical)]";
  const bgColor =
    primary === "first_freeze"
      ? "bg-[color:var(--hotpack-trigger-high)]/10"
      : "bg-[color:var(--hotpack-trigger-critical)]/10";
  const barColor =
    primary === "first_freeze"
      ? "bg-[color:var(--hotpack-trigger-high)]"
      : "bg-[color:var(--hotpack-trigger-critical)]";

  const labels: string[] = [];
  if (hit.first_freeze) labels.push("첫 영하");
  if (hit.cold_shock) labels.push("갑작스러운 추위");
  const label = labels.join(" + ");

  const dLabel =
    hit.dDiff === 0
      ? "오늘"
      : hit.dDiff === 1
        ? "내일"
        : hit.dDiff > 1
          ? `${hit.dDiff}일 후`
          : hit.dDiff === -1
            ? "어제"
            : `${Math.abs(hit.dDiff)}일 전`;
  const detailParts: string[] = [dLabel, `${hit.temp_min.toFixed(1)}℃`];
  if (hit.cold_shock && hit.delta != null) {
    detailParts.push(`전날 대비 ${hit.delta.toFixed(1)}℃`);
  }
  detailParts.push(SOURCE_LABEL[hit.source]);
  const detail = detailParts.join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isHighlighted}
      className={cn(
        "relative flex w-full items-center gap-2 overflow-hidden rounded-md border py-1.5 pr-2 pl-3 text-left text-xs transition-shadow",
        bgColor,
        isHighlighted && "ring-primary/60 ring-2",
        "cursor-pointer hover:shadow-sm"
      )}
    >
      <span aria-hidden className={cn("absolute top-0 left-0 h-full w-1 rounded-l-md", barColor)} />
      <Icon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} aria-hidden />
      <span className="shrink-0 font-medium">{label}</span>
      <span className="text-muted-foreground ml-auto truncate text-[11px] tabular-nums">
        {detail}
      </span>
    </button>
  );
}
