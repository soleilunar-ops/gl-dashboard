"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type MappingRow = Pick<
  Tables<"item_coupang_mapping">,
  "item_id" | "mapping_status" | "bundle_ratio"
>;

/**
 * 근사치 매핑 여부 판정 (v6 2단 기준)
 *
 * 슬아 원안(sku_mappings 테이블) 규칙:
 *   - accuracy !== "★★★" OR relation === "묶음" → 근사치
 *
 * v6 대응(item_coupang_mapping):
 *   - mapping_status !== "verified" OR bundle_ratio > 1 → 근사치
 *     · ai_suggested/rejected/기타 상태 = 미검증 = 근사치
 *     · bundle_ratio > 1 = 번들 SKU = 근사치
 */
export function isApproximateItemMapping(
  mappingStatus: string | null,
  bundleRatio: number | null
): boolean {
  if (mappingStatus !== "verified") return true;
  if (bundleRatio !== null && bundleRatio > 1) return true;
  return false;
}

/** item_id → 쿠팡 매핑 근사치 여부 맵 */
export function useSkuApproximateMap() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data, error: err } = await supabase
        .from("item_coupang_mapping")
        .select("item_id, mapping_status, bundle_ratio");

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows(data ?? []);
        setError(null);
      }
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const approximateByItemId = useMemo(() => {
    const map: Record<number, boolean> = {};
    for (const row of rows) {
      if (isApproximateItemMapping(row.mapping_status ?? null, row.bundle_ratio ?? null)) {
        map[row.item_id] = true;
      }
    }
    return map;
  }, [rows]);

  return { approximateByItemId, loading, error };
}
