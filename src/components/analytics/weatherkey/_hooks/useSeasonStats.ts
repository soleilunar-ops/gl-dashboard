"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, SeasonStats } from "../_types";

const BASELINE_SEASON = "25시즌";

/**
 * 선택된 시즌 + 25시즌 기준선 통계.
 * KpiCard 4종에서 "vs 25시즌" 델타 계산용.
 */
export function useSeasonStats(season: string | null | undefined): HookResult<{
  current: SeasonStats | null;
  baseline: SeasonStats | null;
}> {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState<SeasonStats | null>(null);
  const [baseline, setBaseline] = useState<SeasonStats | null>(null);
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
      const seasons = Array.from(new Set([season, BASELINE_SEASON]));
      const { data, error: qErr } = await supabase
        .from("v_hotpack_season_stats")
        .select("*")
        .in("season", seasons);
      if (qErr) throw new Error(qErr.message);

      const rows = data ?? [];
      setCurrent(rows.find((r) => r.season === season) ?? null);
      setBaseline(rows.find((r) => r.season === BASELINE_SEASON) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시즌 KPI를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [season, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data: { current, baseline },
    loading,
    error,
    refetch: () => void load(),
  };
}
