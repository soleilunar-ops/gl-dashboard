"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, SeasonDaily } from "../_types";

/**
 * 시즌 × 일별 판매·기온 통합 시계열.
 * 메인 차트(SeasonTimelineChart)의 주 데이터 소스.
 */
export function useSeasonDaily(season: string | null | undefined): HookResult<SeasonDaily[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<SeasonDaily[]>([]);
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
        .from("v_hotpack_season_daily")
        .select("*")
        .eq("season", season)
        .order("date", { ascending: true });
      if (qErr) throw new Error(qErr.message);

      setData(rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시즌 일별 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [season, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
