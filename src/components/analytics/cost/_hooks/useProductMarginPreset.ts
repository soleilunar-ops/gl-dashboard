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
  /** 대표 erp_code (gl_pharm 우선) — 표시용. 선택 PK는 itemId 참조 */
  erpCode: string;
  /** item_master.item_id — 이 preset의 PK */
  itemId: number;
  productName: string;
  displayLabel: string;
  pcsPerPallet: number;
  usedPalletFallback: boolean;
  weightGram: number;
  usedWeightFallback: boolean;
  /** 최근 daily_performance.asp (매핑된 SKU 중 첫 번째) */
  recentAsp: number | null;
  /** 최근 orders purchase 단가(CNY) — tx_type='purchase' 최신 건 unit_price */
  purchaseCnyPerUnit: number | null;
  /** item_master.base_cost (KRW 기준 원가) */
  unitCostKrw: number | null;
}

type ItemFullRow = Pick<
  Tables<"v_item_full">,
  | "item_id"
  | "item_name_norm"
  | "item_name_raw"
  | "channel_variant"
  | "gl_erp_code"
  | "gl_pharm_erp_code"
  | "hnb_erp_code"
  | "coupang_mappings"
>;

type ItemMasterRow = Pick<Tables<"item_master">, "item_id" | "base_cost">;

function pickPrimaryErpCode(item: ItemFullRow): string {
  const candidates = [item.gl_pharm_erp_code, item.hnb_erp_code, item.gl_erp_code];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return "";
}

/**
 * 선택된 item_id 기준으로 DB 프리셋 조회 (환율 변경과 무관).
 *
 * 이전 버전은 erpCode 기반이었으나 `item_erp_mapping`에서 같은 erp_code가
 * 여러 item_id에 매핑되는 케이스(19건)가 있어 정확한 preset 로드 불가능.
 * v6 item_master PK인 item_id로 시그니처 전환하여 1:1 매칭 보장.
 */
export function useProductMarginPreset(itemId: number | null | undefined) {
  const [preset, setPreset] = useState<ProductMarginPreset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchPreset = useCallback(async () => {
    if (itemId === null || itemId === undefined || !Number.isFinite(itemId) || itemId <= 0) {
      setPreset(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // 1. v_item_full에서 item_id로 단일 행 조회
    const { data: itemRaw, error: iErr } = await supabase
      .from("v_item_full")
      .select(
        "item_id, item_name_norm, item_name_raw, channel_variant, gl_erp_code, gl_pharm_erp_code, hnb_erp_code, coupang_mappings"
      )
      .eq("item_id", itemId)
      .maybeSingle();

    if (iErr) {
      setPreset(null);
      setError(iErr.message);
      setLoading(false);
      return;
    }
    const item = itemRaw as ItemFullRow | null;
    if (!item || item.item_id === null || item.item_id === undefined) {
      setPreset(null);
      setError("해당 item_id의 품목을 찾을 수 없습니다.");
      setLoading(false);
      return;
    }

    // 2. item_master.base_cost 조회 (v_item_full엔 base_cost 없음)
    const { data: masterRaw, error: mErr } = await supabase
      .from("item_master")
      .select("item_id, base_cost")
      .eq("item_id", item.item_id)
      .maybeSingle();
    if (mErr) {
      setPreset(null);
      setError(mErr.message);
      setLoading(false);
      return;
    }
    const master = masterRaw as ItemMasterRow | null;

    const itemName = item.item_name_norm ?? item.item_name_raw ?? "";
    const inferred = inferWeightGramFromProductName(itemName);
    const usedWeightFallback = inferred === null;
    const weightGram = inferred ?? DEFAULT_WEIGHT_G;

    // v6 item_master에 pcs_per_pallet 없음 → DEFAULT + fallback
    const pcsPerPallet = DEFAULT_PCS_PER_PALLET;
    const usedPalletFallback = true;

    const representativeErp = pickPrimaryErpCode(item);
    const variant =
      item.channel_variant && item.channel_variant.trim()
        ? ` [${item.channel_variant.trim()}]`
        : "";
    const erpLabel = representativeErp || "—";
    const displayLabel = `${itemName}${variant} · ${erpLabel}`;

    // 3. 매핑된 쿠팡 SKU의 최근 ASP
    let recentAsp: number | null = null;
    const mappingsRaw = item.coupang_mappings;
    const mappedSkus: string[] = Array.isArray(mappingsRaw)
      ? (mappingsRaw as Array<{ sku_id?: string }>)
          .map((m) => (typeof m.sku_id === "string" ? m.sku_id : ""))
          .filter(Boolean)
      : [];

    if (mappedSkus.length > 0) {
      const { data: perfData } = await supabase
        .from("daily_performance")
        .select("sku_id, asp, sale_date")
        .in("sku_id", mappedSkus)
        .order("sale_date", { ascending: false })
        .limit(1);
      if (perfData && perfData.length > 0) {
        const asp = Number(perfData[0].asp);
        if (Number.isFinite(asp) && asp > 0) recentAsp = Math.round(asp);
      }
    }

    // 4. 최근 orders purchase 단가 (tx_type='purchase' 최신, status 무관)
    const { data: poRow } = await supabase
      .from("orders")
      .select("unit_price, tx_date")
      .eq("item_id", item.item_id)
      .eq("tx_type", "purchase")
      .order("tx_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const poPrice = poRow?.unit_price;
    const purchaseCnyPerUnit =
      poPrice !== null &&
      poPrice !== undefined &&
      Number.isFinite(Number(poPrice)) &&
      Number(poPrice) > 0
        ? Number(poPrice)
        : null;

    const krw =
      master?.base_cost !== null && master?.base_cost !== undefined
        ? Number(master.base_cost)
        : Number.NaN;
    const unitCostKrw = Number.isFinite(krw) && krw > 0 ? krw : null;

    setPreset({
      erpCode: representativeErp,
      itemId: item.item_id,
      productName: itemName,
      displayLabel,
      pcsPerPallet,
      usedPalletFallback,
      weightGram,
      usedWeightFallback,
      recentAsp,
      purchaseCnyPerUnit,
      unitCostKrw,
    });
    setLoading(false);
  }, [itemId, supabase]);

  useEffect(() => {
    void fetchPreset();
  }, [fetchPreset]);

  return { preset, loading, error, refetch: fetchPreset };
}

/** 매입 CNY 없을 때 item_master.base_cost(원) ÷ 환율로 CNY 단가 추정 */
export function deriveCnyFromKrw(unitCostKrw: number | null, exKrwPerCny: number): number | null {
  if (unitCostKrw === null || exKrwPerCny <= 0) return null;
  return Math.round((unitCostKrw / exKrwPerCny) * 1000) / 1000;
}
