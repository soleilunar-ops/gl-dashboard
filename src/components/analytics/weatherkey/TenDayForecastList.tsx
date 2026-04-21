"use client";

import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ForecastDayCard from "./ForecastDayCard";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";
import { useTenDayWeather } from "./_hooks/useTenDayWeather";

function dayDiffFromToday(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * D-7 ~ D+10 병합 리스트.
 * 마운트 시 '오늘' 카드로 스크롤 포커스.
 */
export default function TenDayForecastList() {
  const { data, loading, error } = useTenDayWeather();
  const { highlighted, toggleHighlight } = useHighlightQuery();
  const listRef = useRef<HTMLDivElement | null>(null);

  const withDiff = useMemo(
    () => data.map((r) => ({ row: r, d: dayDiffFromToday(r.weather_date) })),
    [data]
  );

  useEffect(() => {
    if (loading || withDiff.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>("[data-today='true']");
    el?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [loading, withDiff]);

  if (loading) {
    return (
      <Card className="h-[284px]">
        <CardContent className="flex h-full flex-col gap-1 p-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="w-full flex-1" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-[284px]">
        <CardContent className="text-destructive flex h-full items-center p-4 text-sm">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[284px]">
      <CardContent className="flex h-full flex-col gap-1 p-3">
        <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
          10일 예보 · D-7 ~ D+10
        </div>
        <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto pr-1">
          {withDiff.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
              예보 데이터 없음
            </div>
          ) : (
            withDiff.map(({ row, d }) => (
              <div key={row.weather_date} data-today={d === 0 ? "true" : undefined}>
                <ForecastDayCard
                  row={row}
                  dDiff={d}
                  isHighlighted={highlighted === row.weather_date}
                  onClick={() => toggleHighlight(row.weather_date)}
                />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
