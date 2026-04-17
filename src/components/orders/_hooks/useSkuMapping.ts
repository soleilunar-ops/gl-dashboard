"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** DB에 pcs_per_pallet 미입력(NULL)일 때 물류/개당 원가 NaN 방지용 (마이그레이션 직후 폴백) */
export const DEFAULT_PCS_PER_PALLET = 14400;

/** ERP 코드로 products.pcs_per_pallet 조회 — 마진 계산기 자동 주입용 */
export function useSkuMapping(erpCode: string | null | undefined) {
  const [pcsPerPallet, setPcsPerPallet] = useState<number | null>(null);
  const [usedNullColumnFallback, setUsedNullColumnFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!erpCode || erpCode === "—") {
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
      setUsedNullColumnFallback(false);
      try {
        const { data, error: qErr } = await supabase
          .from("products")
          .select("pcs_per_pallet")
          .eq("erp_code", erpCode)
          .maybeSingle();

        if (controller.signal.aborted) return;
        if (qErr) {
          setPcsPerPallet(null);
          setError(qErr.message);
          return;
        }
        const row = data as { pcs_per_pallet: number | null } | null;
        if (row === null) {
          setPcsPerPallet(null);
          return;
        }
        const raw = row.pcs_per_pallet;
        const n = raw !== null && raw !== undefined ? Number(raw) : Number.NaN;
        if (Number.isFinite(n) && n > 0) {
          setPcsPerPallet(Math.round(n));
          setUsedNullColumnFallback(false);
        } else {
          setPcsPerPallet(DEFAULT_PCS_PER_PALLET);
          setUsedNullColumnFallback(true);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setPcsPerPallet(null);
        setError(e instanceof Error ? e.message : "조회 오류");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [erpCode, supabase]);

  return { pcsPerPallet, usedNullColumnFallback, loading, error };
}
