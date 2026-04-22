"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, WeatherStateLift } from "../_types";

/**
 * 시즌별 정적 날씨 상태 리프트 (v_weather_state_lift).
 * state_key 6종 × (fired_days, avg_when_fired, avg_season, multiplier).
 * 동적 트리거(전일 대비 delta)와 달리 절대 상태 기준.
 */
export function useSeasonStateLift(season: string | null): HookResult<WeatherStateLift[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<WeatherStateLift[]>([]);
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
        .from("v_weather_state_lift")
        .select("*")
        .eq("season", season);
      if (qErr) throw new Error(qErr.message);
      setData(rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 리프트 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [season, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
