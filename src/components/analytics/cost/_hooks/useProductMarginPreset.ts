"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { DEFAULT_PCS_PER_PALLET } from "@/components/orders/_hooks/useSkuMapping";

/** 품목명에서 '160g' '80 g' 형태로 중량(g) 추출 — 없으면 null */
export function inferWeightGramFromProductName(productName: string): number | null {
  const normalized = productName.replace(/\s+/g, " ");
  const m = normalized.match(/(\d{2,4})\s*g(?:\b|[\]/])/i) ?? normalized.match(/(\d{2,4})g\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return null;
  return Math.round(n);
}

const DEFAULT_WEIGHT_G = 10;

export interface ProductMarginPreset {
  erpCode: string;
  productName: string;
  displayLabel: string;
  pcsPerPallet: number;
  usedPalletFallback: boolean;
  weightGram: number;
  usedWeightFallback: boolean;
  recentAsp: number | null;
  /** 최근 ERP 매입 단가(CNY) — 없으면 null, 화면에서 unitCostKrw/환율로 보강 */
  purchaseCnyPerUnit: number | null;
  unitCostKrw: number | null;
}

type ProductRow = Pick<
  Tables<"products">,
  "id" | "name" | "unit" | "erp_code" | "pcs_per_pallet" | "unit_cost" | "coupang_sku_id"
>;

/** ERP 선택 시 DB 기반 프리셋만 조회(환율 변경과 무관) */
export function useProductMarginPreset(erpCode: string | null | undefined) {
  const [preset, setPreset] = useState<ProductMarginPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const normalizedErp = erpCode?.trim() ?? "";

  const fetchPreset = useCallback(async () => {
    if (!normalizedErp) {
      setPreset(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: prodRaw, error: pErr } = await supabase
        .from("products")
        .select("id, name, unit, erp_code, pcs_per_pallet, unit_cost, coupang_sku_id")
        .eq("erp_code", normalizedErp)
        .maybeSingle();

      if (pErr) {
        setPreset(null);
        setError(pErr.message);
        return;
      }
      const prod = prodRaw as ProductRow | null;
      if (!prod) {
        setPreset(null);
        setError("해당 ERP 품목을 찾을 수 없습니다.");
        return;
      }

      const inferred = inferWeightGramFromProductName(prod.name);
      const usedWeightFallback = inferred === null;
      const weightGram = inferred ?? DEFAULT_WEIGHT_G;

      const rawPcs = prod.pcs_per_pallet;
      const nPcs = rawPcs !== null && rawPcs !== undefined ? Number(rawPcs) : Number.NaN;
      const usedPalletFallback = !(Number.isFinite(nPcs) && nPcs > 0);
      const pcsPerPallet = usedPalletFallback ? DEFAULT_PCS_PER_PALLET : Math.round(nPcs);

      const unit = prod.unit?.trim() ?? "";
      const displayLabel = unit
        ? `${prod.name} [${unit}] · ${prod.erp_code ?? normalizedErp}`
        : `${prod.name} · ${prod.erp_code ?? normalizedErp}`;

      let recentAsp: number | null = null;
      const skuStr = prod.coupang_sku_id?.trim();
      if (skuStr) {
        const sid = Number(skuStr);
        if (Number.isFinite(sid)) {
          const { data: perfRow } = await supabase
            .from("coupang_performance")
            .select("asp, date")
            .eq("coupang_sku_id", sid)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle();
          type PerfAsp = Pick<Tables<"coupang_performance">, "asp">;
          const asp = Number((perfRow as PerfAsp | null)?.asp);
          if (Number.isFinite(asp) && asp > 0) recentAsp = Math.round(asp);
        }
      }

      const { data: poRow } = await supabase
        .from("erp_purchases")
        .select("unit_price, purchase_date")
        .eq("erp_code", normalizedErp)
        .order("purchase_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      type PoPrice = Pick<Tables<"erp_purchases">, "unit_price">;
      const poPrice = (poRow as PoPrice | null)?.unit_price;
      const purchaseCnyPerUnit =
        poPrice !== null &&
        poPrice !== undefined &&
        Number.isFinite(Number(poPrice)) &&
        Number(poPrice) > 0
          ? Number(poPrice)
          : null;

      const krw = prod.unit_cost !== null ? Number(prod.unit_cost) : Number.NaN;
      const unitCostKrw = Number.isFinite(krw) && krw > 0 ? krw : null;

      setPreset({
        erpCode: normalizedErp,
        productName: prod.name,
        displayLabel,
        pcsPerPallet,
        usedPalletFallback,
        weightGram,
        usedWeightFallback,
        recentAsp,
        purchaseCnyPerUnit,
        unitCostKrw,
      });
    } catch (e) {
      setPreset(null);
      setError(e instanceof Error ? e.message : "프리셋 조회 오류");
    } finally {
      setLoading(false);
    }
  }, [normalizedErp, supabase]);

  useEffect(() => {
    void fetchPreset();
  }, [fetchPreset]);

  return { preset, loading, error, refetch: fetchPreset };
}

/** 매입 CNY 없을 때 products.unit_cost(원) ÷ 환율로 CNY 단가 추정 */
export function deriveCnyFromKrw(unitCostKrw: number | null, exKrwPerCny: number): number | null {
  if (unitCostKrw === null || exKrwPerCny <= 0) return null;
  return Math.round((unitCostKrw / exKrwPerCny) * 1000) / 1000;
}
