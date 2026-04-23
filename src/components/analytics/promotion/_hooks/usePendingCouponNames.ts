"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type PendingCouponRow = Pick<
  Tables<"promotion_coupon_contracts">,
  "contract_no" | "start_date" | "end_date" | "paid_amount" | "coupon_name" | "coupon_category"
>;

export function usePendingCouponNames() {
  const [rows, setRows] = useState<PendingCouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from("promotion_coupon_contracts")
        .select("contract_no, start_date, end_date, paid_amount, coupon_name, coupon_category")
        .eq("is_baseline", false);
      if (qErr) throw new Error(qErr.message);
      const pending = (data ?? []).filter(
        (r) => r.coupon_name == null || String(r.coupon_name).trim() === ""
      );
      setRows(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : "미입력 계약을 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh, pendingCount: rows.length };
}
