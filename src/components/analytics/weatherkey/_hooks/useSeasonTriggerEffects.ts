"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, TriggerEffect } from "../_types";

/**
 * 시즌별 트리거 집계 (v_hotpack_trigger_effects).
 * trigger_key 5종 × (fired_days, multiplier, precision_pct, avg_baseline, avg_when_fired).
 */
export function useSeasonTriggerEffects(season: string | null): HookResult<TriggerEffect[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TriggerEffect[]>([]);
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
        .from("v_hotpack_trigger_effects")
        .select("*")
        .eq("season", season);
      if (qErr) throw new Error(qErr.message);
      setData(rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "트리거 통계 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [season, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
