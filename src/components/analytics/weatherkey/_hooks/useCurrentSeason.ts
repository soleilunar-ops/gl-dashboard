"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CurrentSeasonInfo, HookResult, SeasonStatus } from "../_types";

export type SeasonResolution = {
  /** 대시보드가 기본으로 표시할 시즌 (active → 최근 closed fallback) */
  current: CurrentSeasonInfo | null;
  /** 오늘 이후 시작 예정인 가장 가까운 시즌 (UI "다음 시즌 시작 예정" 용) */
  next: CurrentSeasonInfo | null;
  /** current의 status가 'active'가 아닐 때 true (비시즌) */
  isOffSeason: boolean;
};

function toInfo(
  season: string,
  status: SeasonStatus,
  start: string | null | undefined,
  end: string | null | undefined
): CurrentSeasonInfo {
  return { season, status, start_date: start ?? "", end_date: end ?? "" };
}

/**
 * 시즌 결정 로직 (docs/HOTPACK_DASHBOARD_LAYOUT.md §8 확정).
 *
 * - current: fn_current_season() active → 없으면 season_config 최근 closed
 * - next: season_config에서 오늘 이후 시작 예정 시즌 중 가장 가까운 것 (is_closed=false)
 * - isOffSeason: current.status !== 'active'
 */
export function useCurrentSeason(): HookResult<SeasonResolution> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<SeasonResolution>({
    current: null,
    next: null,
    isOffSeason: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const todayIso = new Date().toISOString().slice(0, 10);

      const [rpcRes, closedRes, upcomingRes] = await Promise.all([
        supabase.rpc("fn_current_season"),
        supabase
          .from("season_config")
          .select("season, start_date, end_date, is_closed")
          .eq("is_closed", true)
          .order("end_date", { ascending: false })
          .limit(1),
        supabase
          .from("season_config")
          .select("season, start_date, end_date, is_closed")
          .eq("is_closed", false)
          .gt("start_date", todayIso)
          .order("start_date", { ascending: true })
          .limit(1),
      ]);

      if (rpcRes.error) throw new Error(rpcRes.error.message);
      if (closedRes.error) throw new Error(closedRes.error.message);
      if (upcomingRes.error) throw new Error(upcomingRes.error.message);

      const active = rpcRes.data?.find((r) => r.status === "active");
      const upcomingRow = upcomingRes.data?.[0];
      const closed = closedRes.data?.[0];
      let current: CurrentSeasonInfo | null = null;

      // 2월 말 시즌 종료 후 자동 롤오버: active 없으면 다음 예정 시즌을 디폴트로 승격
      if (active) {
        current = toInfo(active.season, "active", active.start_date, active.end_date);
      } else if (upcomingRow) {
        current = toInfo(
          upcomingRow.season,
          "upcoming",
          upcomingRow.start_date,
          upcomingRow.end_date
        );
      } else if (closed) {
        current = toInfo(closed.season, "closed", closed.start_date, closed.end_date);
      }

      const next: CurrentSeasonInfo | null = upcomingRow
        ? toInfo(upcomingRow.season, "upcoming", upcomingRow.start_date, upcomingRow.end_date)
        : null;

      setData({
        current,
        next,
        isOffSeason: current?.status !== "active",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "시즌 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
