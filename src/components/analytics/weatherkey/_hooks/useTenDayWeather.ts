"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, WeatherSource } from "../_types";

export type TenDayRow = {
  weather_date: string;
  source: WeatherSource;
  forecast_day: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_avg: number | null;
  precipitation: number | null;
  humidity_avg: number | null;
};

const SEOUL_STATION = "서울";
const SOURCE_PRIORITY: Record<WeatherSource, number> = {
  asos: 0,
  forecast_short: 1,
  forecast_mid: 2,
  era5: 3,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeDays(centerIsoToday: string, before: number, after: number): string[] {
  const base = new Date(centerIsoToday + "T00:00:00Z");
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    out.push(isoDate(d));
  }
  return out;
}

/**
 * D-7 ~ D+10 병합 예보·실측 시계열.
 * 같은 날짜에 asos·forecast가 공존하면 asos 우선(forecast_short > forecast_mid > era5).
 */
export function useTenDayWeather(): HookResult<TenDayRow[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TenDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = isoDate(new Date());
    const from = rangeDays(today, 7, 10)[0];
    const to = rangeDays(today, 7, 10).at(-1)!;

    try {
      const { data: rows, error: qErr } = await supabase
        .from("weather_unified")
        .select(
          "weather_date, source, forecast_day, temp_min, temp_max, temp_avg, precipitation, humidity_avg"
        )
        .eq("station", SEOUL_STATION)
        .gte("weather_date", from)
        .lte("weather_date", to)
        .order("weather_date", { ascending: true });
      if (qErr) throw new Error(qErr.message);

      // 같은 weather_date에 여러 source면 priority 최상위 1개만
      const bucket = new Map<string, TenDayRow>();
      for (const r of rows ?? []) {
        if (!r.weather_date || !r.source) continue;
        const src = r.source as WeatherSource;
        if (!(src in SOURCE_PRIORITY)) continue;
        const row: TenDayRow = {
          weather_date: r.weather_date,
          source: src,
          forecast_day: r.forecast_day,
          temp_min: r.temp_min,
          temp_max: r.temp_max,
          temp_avg: r.temp_avg,
          precipitation: r.precipitation,
          humidity_avg: r.humidity_avg,
        };
        const prev = bucket.get(row.weather_date);
        if (!prev || SOURCE_PRIORITY[src] < SOURCE_PRIORITY[prev.source]) {
          bucket.set(row.weather_date, row);
        }
      }

      const sorted = Array.from(bucket.values()).sort((a, b) =>
        a.weather_date.localeCompare(b.weather_date)
      );
      setData(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "10일 예보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
