"use client";

// 이 파일은 패턴 참조용 스켈레톤입니다. 기능 구현 시 select 컬럼, 필터, 정렬을 자유롭게 수정하세요.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

// 리뷰 분석: coupang_performance에서 리뷰 관련 필드
type CoupangPerformance = Tables<"coupang_performance">;
type ReviewRow = Pick<
  CoupangPerformance,
  "coupang_sku_id" | "sku_name" | "review_count" | "avg_rating" | "date"
>;

export function useReviews() {
  const [data, setData] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("coupang_performance")
        .select("coupang_sku_id, sku_name, review_count, avg_rating, date")
        .order("date", { ascending: false })
        .limit(100);

      if (error) {
        console.error("리뷰 데이터 조회 실패:", error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      setData((data as ReviewRow[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  return { data, loading, error };
}
