"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult } from "../_types";

export type StateKey = "cold_wave" | "freeze" | "snow" | "cold_and_big_diff";

export type StateEvent = {
  date: string;
  temp_min: number | null;
  temp_max: number | null;
  units_sold: number | null;
  prev_units: number | null;
};

export type StateEventsMap = Record<StateKey, StateEvent[]>;

/**
 * v_weather_daily_state 기반 절대 상태 트리거의 일자별 이벤트.
 * 전일 판매(prev_units)는 클라이언트에서 날짜 정렬 후 LAG 계산.
 */
export function useSeasonStateEvents(season: string | null): HookResult<StateEventsMap> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<StateEventsMap>({
    cold_wave: [],
    freeze: [],
    snow: [],
    cold_and_big_diff: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!season) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: qErr } = await supabase
        .from("v_weather_daily_state")
        .select(
          "date, temp_min, temp_max, units_sold, is_cold_wave, is_freeze, is_snow, is_cold_and_big_diff"
        )
        .eq("season", season)
        .order("date", { ascending: true });
      if (qErr) throw new Error(qErr.message);

      const sorted = rows ?? [];
      const result: StateEventsMap = {
        cold_wave: [],
        freeze: [],
        snow: [],
        cold_and_big_diff: [],
      };

      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        if (!r.date) continue;
        const prev = i > 0 ? sorted[i - 1].units_sold : null;
        const event: StateEvent = {
          date: r.date,
          temp_min: r.temp_min,
          temp_max: r.temp_max,
          units_sold: r.units_sold,
          prev_units: prev,
        };
        if (r.is_cold_wave) result.cold_wave.push(event);
        if (r.is_freeze) result.freeze.push(event);
        if (r.is_snow) result.snow.push(event);
        if (r.is_cold_and_big_diff) result.cold_and_big_diff.push(event);
      }

      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 이벤트 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [season, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
