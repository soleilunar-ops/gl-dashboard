"use client";

// 이 파일은 패턴 참조용 스켈레톤입니다. 기능 구현 시 select 컬럼, 필터, 정렬을 자유롭게 수정하세요.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

// 주문(출고) = stock_movements에서 movement_type='출고' 기준
type StockMovement = Tables<"stock_movements">;
type Product = Tables<"products">;
type OrderRow = StockMovement & { products: Pick<Product, "name" | "erp_code"> | null };

export function useOrders() {
  const [data, setData] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, erp_code)")
        .eq("movement_type", "출고")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("출고 내역 조회 실패:", error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      setData((data as unknown as OrderRow[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  return { data, loading, error };
}
