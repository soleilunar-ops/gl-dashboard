"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

/** 파렛트 적재 수량 기본값 — 변경 이유: item_master에 units_per_pallet 컬럼 없어 폴백 */
const DEFAULT_UNITS_PER_PALLET = 14400;

/** 상품 용량 분류 — 변경 이유: Combobox 그룹핑 기준 */
export type ProductCapacity = "160g" | "100g" | "80g" | "미니" | "기타";

export type Product = {
  id: string;
  erpCode: string;
  name: string;
  unitCost: number;
  unitsPerPallet: number;
  capacity: ProductCapacity;
};

type ItemMasterRow = Pick<
  Tables<"item_master">,
  "item_id" | "item_name_norm" | "item_name_raw" | "base_cost" | "is_active"
>;

/** 품목명 → 용량 분류 — 변경 이유: 160/100/80g, 미니(30g), 기타 그룹 구분 */
function inferCapacity(name: string): ProductCapacity {
  const s = name.replace(/\s+/g, "").toLowerCase();
  if (/미니|30g\b/.test(s)) return "미니";
  if (/160g\b/.test(s)) return "160g";
  if (/100g\b/.test(s)) return "100g";
  if (/80g\b/.test(s)) return "80g";
  return "기타";
}

/** item_master 기반 상품 목록 훅 — 변경 이유: products 테이블 부재 대응 */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from("item_master")
      .select("item_id, item_name_norm, item_name_raw, base_cost, is_active")
      .eq("is_active", true)
      .order("item_name_norm", { ascending: true });

    if (dbError) {
      console.error("[useProducts]", dbError.message);
      setError(dbError.message);
      setProducts([]);
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as ItemMasterRow[];
    const mapped: Product[] = rows.map((row) => {
      const rawName = row.item_name_norm ?? row.item_name_raw ?? "";
      const unitCost =
        row.base_cost !== null && Number.isFinite(Number(row.base_cost))
          ? Number(row.base_cost)
          : 0;
      return {
        id: String(row.item_id),
        erpCode: "",
        name: rawName,
        unitCost,
        unitsPerPallet: DEFAULT_UNITS_PER_PALLET,
        capacity: inferCapacity(rawName),
      };
    });

    setProducts(mapped);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, refetch: fetchProducts };
}
