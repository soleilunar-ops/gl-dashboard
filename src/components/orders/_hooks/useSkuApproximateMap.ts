"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type MappingRow = Pick<Tables<"sku_mappings">, "product_id" | "accuracy" | "relation">;

/** ★★★ 미만 또는 relation=묶음이면 근사치 배지 (문서 ORDERS_DATA_CONTEXT 2-2) */
export function isApproximateSkuMapping(accuracy: string | null, relation: string | null): boolean {
  if (relation === "묶음") {
    return true;
  }
  if (!accuracy || accuracy !== "★★★") {
    return true;
  }
  return false;
}

/** product_id별 쿠팡 매핑 근사치 여부 */
export function useSkuApproximateMap() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const run = async () => {
      const { data, error: err } = await supabase
        .from("sku_mappings")
        .select("product_id, accuracy, relation");

      if (err) {
        console.error("sku_mappings 조회 실패:", err.message);
        setError(err.message);
        setLoading(false);
        return;
      }

      setRows((data as MappingRow[]) ?? []);
      setLoading(false);
    };

    void run();
  }, [supabase]);

  const approximateByProductId = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const row of rows) {
      if (isApproximateSkuMapping(row.accuracy ?? null, row.relation ?? null)) {
        map[row.product_id] = true;
      }
    }
    return map;
  }, [rows]);

  return { approximateByProductId, loading, error };
}
