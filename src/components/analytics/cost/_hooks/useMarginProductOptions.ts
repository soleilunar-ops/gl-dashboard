"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export interface MarginProductOption {
  /** item_master.item_id — 유일 식별자, 향후 v6 조회용 */
  itemId: number;
  /** 대표 ERP 코드. 우선순위 gl_pharm → hnb → gl. hook 내부 필터로 null 제외 보장 */
  erpCode: string;
  /** 사용자에게 보여줄 라벨 */
  label: string;
  /** 본문 품목명 (정규화) */
  name: string;
}

type ItemFullRow = Pick<
  Tables<"v_item_full">,
  | "item_id"
  | "seq_no"
  | "item_name_norm"
  | "item_name_raw"
  | "channel_variant"
  | "gl_erp_code"
  | "gl_pharm_erp_code"
  | "hnb_erp_code"
  | "is_active"
>;

function pickPrimaryErpCode(row: ItemFullRow): string | null {
  // 우선순위: 지엘팜(주공급) → HNB → GL
  if (row.gl_pharm_erp_code && row.gl_pharm_erp_code.trim()) return row.gl_pharm_erp_code.trim();
  if (row.hnb_erp_code && row.hnb_erp_code.trim()) return row.hnb_erp_code.trim();
  if (row.gl_erp_code && row.gl_erp_code.trim()) return row.gl_erp_code.trim();
  return null;
}

/** 마진 계산기 상품 드롭다운 — v_item_full 기반 */
export function useMarginProductOptions() {
  const [options, setOptions] = useState<MarginProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: qErr } = await supabase
      .from("v_item_full")
      .select(
        "item_id, seq_no, item_name_norm, item_name_raw, channel_variant, gl_erp_code, gl_pharm_erp_code, hnb_erp_code, is_active"
      )
      .eq("is_active", true)
      .order("seq_no", { ascending: true });

    if (qErr) {
      setError(qErr.message);
      setOptions([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ItemFullRow[];
    const opts: MarginProductOption[] = [];
    for (const r of rows) {
      if (r.item_id === null || r.item_id === undefined) continue;
      const name = r.item_name_norm ?? r.item_name_raw ?? "";
      if (!name) continue;
      const erpCode = pickPrimaryErpCode(r);
      if (!erpCode) continue; // MarginCalculator가 erpCode로 preset 조회하므로 null 제외
      const variant =
        r.channel_variant && r.channel_variant.trim() ? ` [${r.channel_variant.trim()}]` : "";
      opts.push({
        itemId: r.item_id,
        erpCode,
        name,
        label: `${name}${variant} · ${erpCode}`,
      });
    }
    setOptions(opts);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { options, loading, error, refetch };
}
