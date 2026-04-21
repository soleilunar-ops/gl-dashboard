"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, TriggerDay, WeatherSource } from "../_types";

type ForecastMin = {
  temp_min: number | null;
  source: WeatherSource | null;
};

/**
 * 오늘/내일 트리거 발동 상태.
 *
 * - 오늘: `v_hotpack_triggers` pivot row 1개
 * - 내일: 뷰에 미래 row 없으므로 `weather_unified`의 예보 기온으로 JS 추정
 *   (cold_shock·first_freeze만 추정 가능, search_spike_*는 예측 불가)
 */
export type TriggersState = {
  today: TriggerDay | null;
  tomorrow: {
    date: string;
    forecast_temp_min: number | null;
    forecast_source: WeatherSource | null;
    cold_shock_possible: boolean;
    first_freeze_possible: boolean;
  } | null;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const SEOUL_STATION = "서울";

export function useTriggersTodayTomorrow(): HookResult<TriggersState> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TriggersState>({ today: null, tomorrow: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const todayIso = isoDate(today);
    const tomorrowIso = isoDate(tomorrow);

    try {
      const [todayRes, tmrRes, seasonStatsRes] = await Promise.all([
        supabase.from("v_hotpack_triggers").select("*").eq("date", todayIso).maybeSingle(),
        supabase
          .from("weather_unified")
          .select("temp_min, source")
          .eq("station", SEOUL_STATION)
          .eq("weather_date", tomorrowIso),
        supabase
          .from("v_hotpack_season_stats")
          .select("season, first_freeze")
          .order("season_start", { ascending: false })
          .limit(1),
      ]);

      if (todayRes.error) throw new Error(todayRes.error.message);
      if (tmrRes.error) throw new Error(tmrRes.error.message);
      if (seasonStatsRes.error) throw new Error(seasonStatsRes.error.message);

      const todayRow = todayRes.data;

      // 내일 예보 우선순위: asos(드묾) > forecast_short > forecast_mid > era5
      const priority: Record<string, number> = {
        asos: 0,
        forecast_short: 1,
        forecast_mid: 2,
        era5: 3,
      };
      const forecastRows = (tmrRes.data ?? []).filter(
        (r): r is { temp_min: number | null; source: WeatherSource } =>
          r.source !== null && r.source in priority
      );
      forecastRows.sort((a, b) => (priority[a.source] ?? 99) - (priority[b.source] ?? 99));
      const chosen: ForecastMin | null = forecastRows[0] ?? null;

      const alreadyHadFreeze = Boolean(seasonStatsRes.data?.[0]?.first_freeze);

      const tmr =
        chosen && chosen.temp_min != null
          ? {
              date: tomorrowIso,
              forecast_temp_min: chosen.temp_min,
              forecast_source: chosen.source,
              cold_shock_possible:
                todayRow?.temp_min != null && chosen.temp_min - todayRow.temp_min <= -6,
              first_freeze_possible: !alreadyHadFreeze && chosen.temp_min < 0,
            }
          : null;

      setData({ today: todayRow ?? null, tomorrow: tmr });
    } catch (e) {
      setError(e instanceof Error ? e.message : "트리거 상태를 불러오지 못했습니다.");
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
