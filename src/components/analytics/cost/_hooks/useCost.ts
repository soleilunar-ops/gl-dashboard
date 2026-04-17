"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import {
  CHANNEL_RATES,
  calcProfitWithVatPrice,
  roundCurrency,
  type ChannelKey,
} from "@/lib/margin/useMarginCalc";

type Product = Tables<"products">;
type ProductCostRow = Pick<
  Product,
  "id" | "name" | "category" | "unit_cost" | "erp_code" | "coupang_sku_id"
>;

export interface SkuChannelMarginCell {
  marginRate: number;
  profitPerUnit: number;
}

export interface CostHeatmapRow {
  product: ProductCostRow;
  referenceVatPrice: number | null;
  byChannel: Record<ChannelKey, SkuChannelMarginCell | null>;
  /** 최근 90일 coupang_performance GMV 합계 — Top-N 정렬용 */
  gmv90d: number;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 원가(Supabase) + 쿠팡 최근 ASP 기준 채널×SKU 마진 히트맵 데이터 */
export function useCost() {
  const [rows, setRows] = useState<CostHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, name, category, unit_cost, erp_code, coupang_sku_id")
        .order("name", { ascending: true })
        .limit(200);

      if (pErr) {
        setError(pErr.message);
        setRows([]);
        return;
      }

      const list = (products as ProductCostRow[]) ?? [];
      const skuNums = [
        ...new Set(
          list
            .map((p) => p.coupang_sku_id)
            .filter((v): v is string => Boolean(v))
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n))
        ),
      ];

      const aspBySku = new Map<number, number>();
      const gmvBySku = new Map<number, number>();

      if (skuNums.length > 0) {
        const [aspRes, gmvRes] = await Promise.all([
          supabase
            .from("coupang_performance")
            .select("coupang_sku_id, asp, date")
            .in("coupang_sku_id", skuNums)
            .gte("date", daysAgoIso(120))
            .order("date", { ascending: false })
            .limit(8000),
          supabase
            .from("coupang_performance")
            .select("coupang_sku_id, gmv")
            .in("coupang_sku_id", skuNums)
            .gte("date", daysAgoIso(90))
            .limit(25000),
        ]);

        type PerfPick = Pick<Tables<"coupang_performance">, "coupang_sku_id" | "asp" | "date">;
        const perfRows = (aspRes.data ?? []) as PerfPick[];
        if (!aspRes.error) {
          for (const row of perfRows) {
            const sid = Number(row.coupang_sku_id);
            const asp = Number(row.asp);
            if (!Number.isFinite(sid) || asp <= 0) continue;
            if (!aspBySku.has(sid)) aspBySku.set(sid, asp);
          }
        }

        type GmvPick = Pick<Tables<"coupang_performance">, "coupang_sku_id" | "gmv">;
        const gmvRows = (gmvRes.data ?? []) as GmvPick[];
        if (!gmvRes.error) {
          for (const row of gmvRows) {
            const sid = Number(row.coupang_sku_id);
            const g = Number(row.gmv) || 0;
            if (!Number.isFinite(sid)) continue;
            gmvBySku.set(sid, (gmvBySku.get(sid) ?? 0) + g);
          }
        }
      }

      const channels = Object.keys(CHANNEL_RATES) as ChannelKey[];
      const nextRows: CostHeatmapRow[] = list.map((product) => {
        const skuNum =
          product.coupang_sku_id !== null && product.coupang_sku_id !== undefined
            ? Number(product.coupang_sku_id)
            : Number.NaN;
        const referenceVatPrice =
          Number.isFinite(skuNum) && aspBySku.has(skuNum) ? (aspBySku.get(skuNum) ?? null) : null;
        const gmv90d = Number.isFinite(skuNum) ? (gmvBySku.get(skuNum) ?? 0) : 0;
        const unitCost = product.unit_cost !== null ? Number(product.unit_cost) : Number.NaN;
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

      nextRows.sort((a, b) => b.gmv90d - a.gmv90d);
      setRows(nextRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "원가 데이터 조회 실패");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { rows, loading, error, refetch: fetchData };
}
