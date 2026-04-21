"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import {
  CHANNEL_RATES,
  calcProfitWithVatPrice,
  roundCurrency,
  type ChannelKey,
} from "@/lib/margin";

type ItemMasterRow = Pick<
  Tables<"item_master">,
  "item_id" | "item_name_norm" | "item_name_raw" | "category" | "item_type" | "base_cost"
>;

type CoupangMappingRow = Pick<
  Tables<"item_coupang_mapping">,
  "item_id" | "coupang_sku_id" | "bundle_ratio"
>;

type DailyPerformanceRow = Pick<
  Tables<"daily_performance">,
  "sku_id" | "sale_date" | "asp" | "gmv"
>;

/** 품목 기준 원가/마진 히트맵 행 (기존: 쿠팡 SKU 단일 매핑 → v6: 품목 ↔ N개 SKU 번들 매핑) */
export interface CostHeatmapRow {
  product: ItemMasterRow;
  /** 매핑된 SKU 중 최근 ASP (여러 SKU가 있으면 가중 평균 or 최대 ASP) */
  referenceVatPrice: number | null;
  byChannel: Record<ChannelKey, SkuChannelMarginCell | null>;
  /** 최근 90일 GMV 합계 — 품목에 매핑된 모든 SKU 합산 */
  gmv90d: number;
}

export interface SkuChannelMarginCell {
  marginRate: number;
  profitPerUnit: number;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 원가(item_master.base_cost) + 쿠팡 최근 ASP(daily_performance) 기준 채널×품목 마진 히트맵 */
export function useCost() {
  const [rows, setRows] = useState<CostHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. 품목 목록 + 쿠팡 매핑 병렬 조회
    const [itemRes, mapRes] = await Promise.all([
      supabase
        .from("item_master")
        .select("item_id, item_name_norm, item_name_raw, category, item_type, base_cost")
        .eq("is_active", true)
        .order("item_id", { ascending: true }),
      supabase
        .from("item_coupang_mapping")
        .select("item_id, coupang_sku_id, bundle_ratio")
        .eq("mapping_status", "verified"),
    ]);

    if (itemRes.error) {
      setError(itemRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    if (mapRes.error) {
      setError(mapRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const items = (itemRes.data ?? []) as ItemMasterRow[];
    const mappings = (mapRes.data ?? []) as CoupangMappingRow[];

    // 품목 → SKU 리스트
    const skusByItem = new Map<number, string[]>();
    for (const m of mappings) {
      if (!m.coupang_sku_id) continue;
      const list = skusByItem.get(m.item_id) ?? [];
      list.push(m.coupang_sku_id);
      skusByItem.set(m.item_id, list);
    }

    const allSkus = [...new Set(mappings.map((m) => m.coupang_sku_id).filter(Boolean))] as string[];

    // 2. 매핑된 SKU에 대한 최근 ASP + 90일 GMV 병렬 조회
    const aspBySku = new Map<string, number>();
    const gmvBySku = new Map<string, number>();

    if (allSkus.length > 0) {
      const [aspRes, gmvRes] = await Promise.all([
        supabase
          .from("daily_performance")
          .select("sku_id, sale_date, asp, gmv")
          .in("sku_id", allSkus)
          .gte("sale_date", daysAgoIso(120))
          .order("sale_date", { ascending: false })
          .limit(8000),
        supabase
          .from("daily_performance")
          .select("sku_id, sale_date, asp, gmv")
          .in("sku_id", allSkus)
          .gte("sale_date", daysAgoIso(90))
          .limit(25000),
      ]);

      if (!aspRes.error) {
        const aspRows = (aspRes.data ?? []) as DailyPerformanceRow[];
        for (const row of aspRows) {
          const sid = row.sku_id;
          const asp = Number(row.asp);
          if (!sid || asp <= 0) continue;
          if (!aspBySku.has(sid)) aspBySku.set(sid, asp);
        }
      }

      if (!gmvRes.error) {
        const gmvRows = (gmvRes.data ?? []) as DailyPerformanceRow[];
        for (const row of gmvRows) {
          const sid = row.sku_id;
          const g = Number(row.gmv) || 0;
          if (!sid) continue;
          gmvBySku.set(sid, (gmvBySku.get(sid) ?? 0) + g);
        }
      }
    }

    // 3. 품목별 집계
    const channels = Object.keys(CHANNEL_RATES) as ChannelKey[];
    const nextRows: CostHeatmapRow[] = items.map((product) => {
      const skuList = skusByItem.get(product.item_id) ?? [];

      // 품목의 SKU 중 ASP 최대값을 reference로 (여러 채널 대표값)
      let referenceVatPrice: number | null = null;
      for (const sku of skuList) {
        const asp = aspBySku.get(sku);
        if (asp !== undefined && (referenceVatPrice === null || asp > referenceVatPrice)) {
          referenceVatPrice = asp;
        }
      }

      // 90일 GMV: 품목에 매핑된 모든 SKU 합산
      let gmv90d = 0;
      for (const sku of skuList) {
        gmv90d += gmvBySku.get(sku) ?? 0;
      }

      const unitCost =
        product.base_cost !== null && product.base_cost !== undefined
          ? Number(product.base_cost)
          : Number.NaN;

      const byChannel = {} as Record<ChannelKey, SkuChannelMarginCell | null>;
      for (const ch of channels) {
        if (
          !Number.isFinite(unitCost) ||
          unitCost <= 0 ||
          referenceVatPrice === null ||
          referenceVatPrice <= 0
        ) {
          byChannel[ch] = null;
          continue;
        }
        const settlementRatio = CHANNEL_RATES[ch].settlementRatio;
        const pr = calcProfitWithVatPrice(unitCost, referenceVatPrice, 1, settlementRatio);
        byChannel[ch] = {
          marginRate: pr.marginRate,
          profitPerUnit: roundCurrency(pr.profitPerUnit),
        };
      }

      return { product, referenceVatPrice, byChannel, gmv90d };
    });

    // GMV 내림차순 정렬 (Top-N 우선)
    nextRows.sort((a, b) => b.gmv90d - a.gmv90d);
    setRows(nextRows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { rows, loading, error, refetch: fetchData };
}
