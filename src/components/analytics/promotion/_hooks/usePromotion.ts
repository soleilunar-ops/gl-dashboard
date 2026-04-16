"use client";

// 이 파일은 패턴 참조용 스켈레톤입니다. 기능 구현 시 select 컬럼, 필터, 정렬을 자유롭게 수정하세요.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

// 프로모션 분석: coupang_performance에서 프로모션 관련 컬럼
type CoupangPerformance = Tables<"coupang_performance">;
type PromoRow = Pick<
  CoupangPerformance,
  | "coupang_sku_id"
  | "sku_name"
  | "date"
  | "gmv"
  | "promo_gmv"
  | "promo_units"
  | "coupon_discount"
  | "instant_discount"
  | "units_sold"
>;

export function usePromotion() {
  const [data, setData] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("coupang_performance")
        .select(
          "coupang_sku_id, sku_name, date, gmv, promo_gmv, promo_units, coupon_discount, instant_discount, units_sold"
        )
        .order("date", { ascending: false })
        .limit(500);

      if (error) {
        console.error("프로모션 데이터 조회 실패:", error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      setData((data as PromoRow[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  return { data, loading, error };
}
