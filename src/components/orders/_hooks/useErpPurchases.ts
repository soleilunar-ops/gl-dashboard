"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type ProductPick = Pick<Tables<"products">, "name" | "erp_code" | "unit">;
export type ErpPurchaseWithProduct = Tables<"erp_purchases"> & {
  products: ProductPick | null;
};

/** 수입 구매(ERP 동기화) 목록 — 로컬 파일/엑셀 없이 Supabase만 사용 */
export function useErpPurchases(limit = 200) {
  const [data, setData] = useState<ErpPurchaseWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data: rows, error: err } = await supabase
        .from("erp_purchases")
        .select(
          `
          id,
          product_id,
          erp_code,
          erp_product_name,
          supplier_name,
          purchase_date,
          quantity,
          unit_price,
          amount,
          erp_ref,
          source,
          products (name, erp_code, unit)
        `
        )
        .order("purchase_date", { ascending: false })
        .limit(limit);

      if (err) {
        console.error("erp_purchases 조회 실패:", err.message);
        setError(err.message);
        setLoading(false);
        return;
      }

      setData((rows as ErpPurchaseWithProduct[]) ?? []);
      setLoading(false);
    };

    void run();
  }, [supabase, limit, refreshKey]);

  const refetch = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return { data, loading, error, refetch };
}
