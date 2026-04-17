"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface MarginProductOption {
  erpCode: string;
  label: string;
}

/** 마진 계산기 상품 드롭다운 — ERP 코드가 있는 품목만 */
export function useMarginProductOptions() {
  const [options, setOptions] = useState<MarginProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from("products")
        .select("erp_code, name, unit")
        .not("erp_code", "is", null)
        .order("name", { ascending: true })
        .limit(500);

      if (qErr) {
        setError(qErr.message);
        setOptions([]);
        return;
      }

      const rows = (data ?? []) as { erp_code: string | null; name: string; unit: string | null }[];
      const opts: MarginProductOption[] = [];
      for (const r of rows) {
        const code = r.erp_code?.trim();
        if (!code) continue;
        const unit = r.unit?.trim() ?? "";
        opts.push({
          erpCode: code,
          label: unit ? `${r.name} [${unit}] · ${code}` : `${r.name} · ${code}`,
        });
      }
      setOptions(opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 오류");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { options, loading, error, refetch };
}
