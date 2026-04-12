"use client";

// 이 파일은 패턴 참조용 스켈레톤입니다. 기능 구현 시 select 컬럼, 필터, 정렬을 자유롭게 수정하세요.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

// 원가 분석: products(unit_cost) + coupang_performance(cogs)
type Product = Tables<"products">;
type CostRow = Pick<
  Product,
  "id" | "name" | "category" | "unit_cost" | "erp_code" | "coupang_sku_id"
>;

export function useCost() {
  const [data, setData] = useState<CostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, unit_cost, erp_code, coupang_sku_id")
        .order("name", { ascending: true })
        .limit(200);

      if (error) {
        console.error("원가 데이터 조회 실패:", error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      setData((data as CostRow[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  return { data, loading, error };
}
