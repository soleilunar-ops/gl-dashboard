"use client";

import { Cloud, CloudSun, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TenDayRow } from "./_hooks/useTenDayWeather";
import type { WeatherSource } from "./_types";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const SOURCE_BG: Record<WeatherSource, string> = {
  asos: "",
  forecast_short: "bg-[color:var(--hotpack-source-short)]",
  forecast_mid: "bg-[color:var(--hotpack-source-mid)]",
  era5: "bg-muted/30",
};

const SOURCE_LABEL: Record<WeatherSource, string> = {
  asos: "실측",
  forecast_short: "단기",
  forecast_mid: "중기",
  era5: "ERA5",
};

function mmdd(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dow(iso: string): string {
  const d = new Date(iso);
  return DOW[d.getDay()];
}

function dLabel(n: number): string {
  if (n === 0) return "오늘";
  if (n > 0) return `D+${n}`;
  return `D${n}`;
}

interface Props {
  row: TenDayRow;
  /** today=0, 과거=음수, 미래=양수 */
  dDiff: number;
  isHighlighted?: boolean;
  onClick?: () => void;
}

export default function ForecastDayCard({ row, dDiff, isHighlighted, onClick }: Props) {
  const isToday = dDiff === 0;
  const isFuture = dDiff > 0;
  const SourceIcon = row.source === "forecast_mid" ? Cloud : CloudSun;

  const className = cn(
    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-shadow",
    SOURCE_BG[row.source],
    isToday && "border-primary ring-primary/40 ring-1",
    isHighlighted && "ring-2 ring-[color:var(--hotpack-trigger-critical)]/70",
    onClick && "hover:shadow-sm cursor-pointer"
  );

  const inner = (
    <>
      <span
        className={cn(
          "w-10 shrink-0 text-[10px] tabular-nums",
          isToday ? "text-primary font-medium" : "text-muted-foreground"
        )}
      >
        {dLabel(dDiff)}
      </span>
      <span className="w-14 shrink-0 font-medium tabular-nums">
        {mmdd(row.weather_date)} ({dow(row.weather_date)})
      </span>
      {isFuture && <SourceIcon className="text-muted-foreground h-3 w-3 shrink-0" aria-hidden />}
      <span className="text-muted-foreground shrink-0 text-[10px]">{SOURCE_LABEL[row.source]}</span>
      <span className="ml-auto flex items-baseline gap-1 tabular-nums">
        <span className="font-medium text-[color:var(--hotpack-line-temp)]">
          {row.temp_min != null ? `${row.temp_min.toFixed(1)}°` : "–"}
        </span>
        <span className="text-muted-foreground">/</span>
        <span>{row.temp_max != null ? `${row.temp_max.toFixed(1)}°` : "–"}</span>
      </span>
      {row.precipitation != null && row.precipitation > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-[color:var(--hotpack-keyword-1)] tabular-nums">
          <Droplets className="h-3 w-3" aria-hidden />
          {row.precipitation.toFixed(1)}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={isHighlighted}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
