"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CronJobStatus, DataFreshness, HookResult } from "../_types";
import { healthLevel } from "../_tokens";

export type HealthLevel = "good" | "warn" | "bad";

export type DataHealthState = {
  level: HealthLevel;
  worstDaysBehind: number | null;
  freshness: DataFreshness[];
  cronJobs: CronJobStatus[];
};

/**
 * 상단바 건강도 배지용.
 *
 * - `v_hotpack_data_freshness`: 소스별 days_behind (asos/forecast_short/forecast_mid/keyword 등)
 * - `v_cron_job_status`: pg_cron 잡 최근 실행 상태
 * 전체 level은 가장 나쁜 소스 기준.
 */
export function useDataHealth(): HookResult<DataHealthState> {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<DataHealthState>({
    level: "good",
    worstDaysBehind: null,
    freshness: [],
    cronJobs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [freshRes, cronRes] = await Promise.all([
        supabase.from("v_hotpack_data_freshness").select("*"),
        supabase.from("v_cron_job_status").select("*"),
      ]);

      if (freshRes.error) throw new Error(freshRes.error.message);
      if (cronRes.error) throw new Error(cronRes.error.message);

      const freshness = freshRes.data ?? [];
      const cronJobs = cronRes.data ?? [];

      const days = freshness
        .map((f) => f.days_behind)
        .filter((v): v is number => typeof v === "number");
      const worst = days.length > 0 ? Math.max(...days) : null;

      const cronFailed = cronJobs.some((j) => j.last_status && j.last_status !== "succeeded");

      let level = healthLevel(worst);
      if (cronFailed) level = "bad";

      setState({ level, worstDaysBehind: worst, freshness, cronJobs });
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 건강도 조회 실패");
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

  return { data: state, loading, error, refetch: () => void load() };
}
