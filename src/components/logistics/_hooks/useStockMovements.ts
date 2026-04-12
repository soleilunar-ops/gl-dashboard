"use client";

// 이 파일은 패턴 참조용 스켈레톤입니다. 기능 구현 시 select 컬럼, 필터, 정렬을 자유롭게 수정하세요.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

// 입출고 내역: stock_movements + products JOIN
type StockMovement = Tables<"stock_movements">;
type Product = Tables<"products">;
type MovementRow = StockMovement & {
  products: Pick<Product, "name" | "erp_code"> | null;
};

export function useStockMovements() {
  const [data, setData] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, erp_code)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("입출고 내역 조회 실패:", error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      setData((data as unknown as MovementRow[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  return { data, loading, error };
}
