"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult } from "../_types";

export type TopSkuRow = {
  sku_id: string;
  sku_name: string;
  category: string | null;
  units: number;
  gmv: number;
  prev_day_units: number | null;
  pct_vs_prev: number | null;
  season_avg_units: number;
  pct_vs_avg: number | null;
};

type FetchResult = {
  rows: TopSkuRow[];
  dayTotalUnits: number;
  prevDayTotalUnits: number | null;
  seasonAvgTotalUnits: number | null; // 피크 기간 핫팩 전체 일평균
};

const EMPTY: FetchResult = {
  rows: [],
  dayTotalUnits: 0,
  prevDayTotalUnits: null,
  seasonAvgTotalUnits: null,
};

/**
 * 선택일의 핫팩 SKU 판매 TOP3 + 전날 + 피크 기간(11/1~2/8) 일평균 대비 증감.
 *
 * Supabase PostgREST max-rows=1000 제한을 피하기 위해 쿼리를 작은 단위로 분할:
 *  1) dayRows         : 선택일 × 핫팩 SKU         (~50 row)
 *  2) prevRows        : 전날 × 핫팩 SKU           (~50 row)
 *  3) peakDaily       : 피크 기간 일자별 집계 뷰  (~100 row)
 *  4) top3SeasonRows  : top3 SKU × 피크 기간      (~300 row)
 */
export function useDailyTopSkus(
  season: string | null,
  date: string | null
): HookResult<FetchResult> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<FetchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!season || !date) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // season_config에서 start_date 파싱 → 피크 범위 계산
      const { data: cfg, error: cfgErr } = await supabase
        .from("season_config")
        .select("start_date")
        .eq("season", season)
        .single();
      if (cfgErr) throw new Error(cfgErr.message);
      const seasonStartYear = parseInt(cfg.start_date.slice(0, 4), 10);
      const peakStart = `${seasonStartYear}-11-01`;
      const peakEnd = `${seasonStartYear + 1}-02-08`;

      // 전날 계산
      const d = new Date(date);
      d.setDate(d.getDate() - 1);
      const prevDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // 핫팩 SKU 목록
      const { data: hotpackSkus, error: skuErr } = await supabase
        .from("v_hotpack_skus")
        .select("sku_id, sku_name, category");
      if (skuErr) throw new Error(skuErr.message);
      const skuMap = new Map<
        string,
        { sku_id: string | null; sku_name: string | null; category: string | null }
      >();
      for (const s of hotpackSkus ?? []) {
        if (s.sku_id) skuMap.set(s.sku_id, s);
      }
      const hotpackIds: string[] = Array.from(skuMap.keys());
      if (hotpackIds.length === 0) {
        setData(EMPTY);
        return;
      }

      // 1) 선택일 × 핫팩 SKU
      const { data: dayRows, error: dErr } = await supabase
        .from("daily_performance")
        .select("sku_id, units_sold, gmv")
        .eq("sale_date", date)
        .in("sku_id", hotpackIds);
      if (dErr) throw new Error(dErr.message);

      const bySku = new Map<string, { units: number; gmv: number }>();
      for (const r of dayRows ?? []) {
        if (r.units_sold == null) continue;
        const cur = bySku.get(r.sku_id) ?? { units: 0, gmv: 0 };
        cur.units += Number(r.units_sold);
        cur.gmv += Number(r.gmv ?? 0);
        bySku.set(r.sku_id, cur);
      }
      const dayTotalUnits = Array.from(bySku.values()).reduce((a, b) => a + b.units, 0);

      const top3 = Array.from(bySku.entries())
        .sort(([, a], [, b]) => b.units - a.units)
        .slice(0, 3);
      const top3Ids = top3.map(([id]) => id);

      // 2) 전날 × 핫팩 SKU
      const { data: prevRows, error: pErr } = await supabase
        .from("daily_performance")
        .select("sku_id, units_sold")
        .eq("sale_date", prevDate)
        .in("sku_id", hotpackIds);
      if (pErr) throw new Error(pErr.message);

      let prevDayTotal: number | null = null;
      const prevBySku = new Map<string, number>();
      for (const r of prevRows ?? []) {
        if (r.units_sold == null) continue;
        prevDayTotal = (prevDayTotal ?? 0) + Number(r.units_sold);
        if (top3Ids.includes(r.sku_id)) {
          prevBySku.set(r.sku_id, (prevBySku.get(r.sku_id) ?? 0) + Number(r.units_sold));
        }
      }

      // 3) 피크 기간 일자별 집계 — 핫팩 전체 일평균
      const { data: peakDaily, error: pkErr } = await supabase
        .from("v_hotpack_season_daily")
        .select("date, units_sold")
        .eq("season", season)
        .gte("date", peakStart)
        .lte("date", peakEnd);
      if (pkErr) throw new Error(pkErr.message);

      let peakTotal = 0;
      let peakDays = 0;
      for (const r of peakDaily ?? []) {
        if (r.units_sold == null) continue;
        peakTotal += Number(r.units_sold);
        peakDays += 1;
      }
      const seasonAvgTotalUnits = peakDays > 0 ? peakTotal / peakDays : null;

      // 4) top3 SKU × 피크 기간 — 각 SKU 피크 평균
      const seasonAvgMap = new Map<string, number>();
      if (top3Ids.length > 0) {
        const { data: top3Rows, error: tErr } = await supabase
          .from("daily_performance")
          .select("sku_id, sale_date, units_sold")
          .in("sku_id", top3Ids)
          .gte("sale_date", peakStart)
          .lte("sale_date", peakEnd);
        if (tErr) throw new Error(tErr.message);

        const aggr = new Map<string, { total: number; daysSet: Set<string> }>();
        for (const r of top3Rows ?? []) {
          if (r.units_sold == null || r.sale_date == null) continue;
          const cur = aggr.get(r.sku_id) ?? { total: 0, daysSet: new Set<string>() };
          cur.total += Number(r.units_sold);
          cur.daysSet.add(r.sale_date);
          aggr.set(r.sku_id, cur);
        }
        for (const [id, { total, daysSet }] of aggr) {
          seasonAvgMap.set(id, daysSet.size > 0 ? total / daysSet.size : 0);
        }
      }

      const rows: TopSkuRow[] = top3.map(([sku_id, { units, gmv }]) => {
        const meta = skuMap.get(sku_id);
        const avg = seasonAvgMap.get(sku_id) ?? 0;
        const prev = prevDayTotal != null ? (prevBySku.get(sku_id) ?? 0) : null;
        return {
          sku_id,
          sku_name: meta?.sku_name ?? sku_id,
          category: meta?.category ?? null,
          units,
          gmv,
          prev_day_units: prev,
          pct_vs_prev: prev != null && prev > 0 ? ((units - prev) / prev) * 100 : null,
          season_avg_units: avg,
          pct_vs_avg: avg > 0 ? ((units - avg) / avg) * 100 : null,
        };
      });

      setData({
        rows,
        dayTotalUnits,
        prevDayTotalUnits: prevDayTotal,
        seasonAvgTotalUnits,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "TOP SKU 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [season, date, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
