"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, SeasonStats } from "../_types";

/**
 * 선택된 시즌 + 직전 시즌 baseline 통계.
 *
 * YoY 동일 기간 정렬 (현재 시즌의 season_end MM-DD까지 baseline 잘라서 집계).
 * 현재 시즌이 9/1~12/4까지면 baseline도 9/1~12/4 구간으로 잘라 비교 → 진행률 편향 제거.
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
      // 직전 시즌 추정 — "25시즌" → "24시즌"
      const m = season.match(/^(\d+)시즌$/);
      const prevSeason = m ? `${Math.max(0, parseInt(m[1], 10) - 1)}시즌` : null;

      // 현재 시즌은 뷰 그대로
      const { data: curRow, error: curErr } = await supabase
        .from("v_hotpack_season_stats")
        .select("*")
        .eq("season", season)
        .maybeSingle();
      if (curErr) throw new Error(curErr.message);
      setCurrent((curRow as SeasonStats | null) ?? null);

      if (!prevSeason || !curRow?.season_end) {
        setBaseline(null);
        return;
      }

      // baseline 시즌을 현재 season_end의 MM-DD까지 잘라 직접 집계
      const cutoffMmDd = String(curRow.season_end).slice(5); // "MM-DD"
      const { data: prevCfg } = await supabase
        .from("season_config")
        .select("start_date, end_date")
        .eq("season", prevSeason)
        .maybeSingle();
      if (!prevCfg?.start_date) {
        setBaseline(null);
        return;
      }
      const prevStartYear = parseInt(String(prevCfg.start_date).slice(0, 4), 10);
      const cutoffMonth = parseInt(cutoffMmDd.slice(0, 2), 10);
      // 9~12월이면 시즌 시작 연도, 1~8월이면 다음 해
      const cutoffYear = cutoffMonth >= 9 ? prevStartYear : prevStartYear + 1;
      const baselineCutoff = `${cutoffYear}-${cutoffMmDd}`;

      const { data: daily, error: dErr } = await supabase
        .from("v_hotpack_season_daily")
        .select("date, temp_min, temp_max, units_sold, gmv")
        .eq("season", prevSeason)
        .lte("date", baselineCutoff);
      if (dErr) throw new Error(dErr.message);

      const rows = (daily ?? []).filter((r) => r.units_sold != null && Number(r.units_sold) > 0);
      if (rows.length === 0) {
        setBaseline(null);
        return;
      }

      // peak
      let peakRow = rows[0];
      for (const r of rows) {
        if ((r.units_sold ?? 0) > (peakRow.units_sold ?? 0)) peakRow = r;
      }

      // corr (tmin vs ln(units))
      const xs: number[] = [];
      const lys: number[] = [];
      let totalUnits = 0;
      let totalGmv = 0;
      let firstFreeze: string | null = null;
      let lowestTemp = Infinity;
      for (const r of rows) {
        if (r.temp_min == null || r.units_sold == null) continue;
        xs.push(Number(r.temp_min));
        lys.push(Math.log(Math.max(Number(r.units_sold), 1)));
        totalUnits += Number(r.units_sold);
        totalGmv += Number(r.gmv ?? 0);
        if (Number(r.temp_min) < 0 && !firstFreeze && r.date) firstFreeze = r.date;
        if (Number(r.temp_min) < lowestTemp) lowestTemp = Number(r.temp_min);
      }
      const n = xs.length;
      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const mx = mean(xs);
      const my = mean(lys);
      let num = 0,
        dx = 0,
        dy = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - mx) * (lys[i] - my);
        dx += (xs[i] - mx) ** 2;
        dy += (lys[i] - my) ** 2;
      }
      const rLog = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;

      const alignedBaseline: SeasonStats = {
        season: prevSeason,
        season_start: rows[0].date ?? null,
        season_end: rows[rows.length - 1].date ?? null,
        days_in_data: rows.length,
        total_units: totalUnits,
        total_gmv: totalGmv,
        avg_daily_units: Math.round(totalUnits / rows.length),
        peak_date: peakRow.date ?? null,
        peak_units: (peakRow.units_sold as number) ?? null,
        peak_gmv: null,
        peak_tmin: (peakRow.temp_min as number) ?? null,
        r_linear: null,
        r_log: rLog != null ? Number(rLog.toFixed(3)) : null,
        first_sub_10: null,
        first_sub_5: null,
        first_freeze: firstFreeze,
        first_sub_minus_5: null,
        first_arctic: null,
        season_lowest_temp: lowestTemp === Infinity ? null : lowestTemp,
        season_highest_temp: null,
      };
      setBaseline(alignedBaseline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시즌 지표를 불러오지 못했습니다.");
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
