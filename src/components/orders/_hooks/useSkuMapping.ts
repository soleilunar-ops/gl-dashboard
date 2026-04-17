"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

/**
 * DB에 pcs_per_pallet 컬럼이 없을 때 물류/개당 원가 NaN 방지용 폴백 상수.
 * v6 item_master에는 pcs_per_pallet 컬럼이 아직 없음 — 후속 PR에서 추가 예정.
 * 현재는 전체 품목이 DEFAULT로 반환되고 usedNullColumnFallback=true가 항상 세팅됨.
 */
export const DEFAULT_PCS_PER_PALLET = 14400;

type ItemErpMappingRow = Pick<Tables<"item_erp_mapping">, "item_id" | "erp_code" | "erp_system">;

/**
 * ERP 코드 → item_id 매핑 조회 + pcs_per_pallet 폴백.
 *
 * 기존(슬아 원안): products 테이블에 pcs_per_pallet 컬럼이 있다고 가정.
 * v6 (본 재작성): item_master에 해당 컬럼 없음 — DEFAULT 반환 + fallback 플래그.
 * 반환값 중 itemId는 향후 v_item_full/stock 조회 등에 활용 가능.
 */
export function useSkuMapping(erpCode: string | null | undefined) {
  const [itemId, setItemId] = useState<number | null>(null);
  const [pcsPerPallet, setPcsPerPallet] = useState<number | null>(null);
  const [usedNullColumnFallback, setUsedNullColumnFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!erpCode || erpCode === "—") {
      setItemId(null);
      setPcsPerPallet(null);
      setUsedNullColumnFallback(false);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        // item_erp_mapping에서 verified 상태의 ERP 매핑을 우선 조회
        const { data, error: qErr } = await supabase
          .from("item_erp_mapping")
          .select("item_id, erp_code, erp_system")
          .eq("erp_code", erpCode)
          .eq("mapping_status", "verified")
          .limit(1)
          .maybeSingle();

        if (controller.signal.aborted) return;
        if (qErr) {
          setItemId(null);
          setPcsPerPallet(null);
          setError(qErr.message);
          return;
        }
        const row = data as ItemErpMappingRow | null;
        setItemId(row?.item_id ?? null);

        // pcs_per_pallet 컬럼은 v6 스키마에 없음 — 항상 DEFAULT + fallback 플래그
        setPcsPerPallet(DEFAULT_PCS_PER_PALLET);
        setUsedNullColumnFallback(true);
      } catch (e) {
        if (controller.signal.aborted) return;
        setItemId(null);
        setPcsPerPallet(null);
        setError(e instanceof Error ? e.message : "조회 오류");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [erpCode, supabase]);

  return { itemId, pcsPerPallet, usedNullColumnFallback, loading, error };
}
