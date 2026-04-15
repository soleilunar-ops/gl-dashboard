"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import type { ReviewEntry } from "../review.types";
import { analyzeReviewsLocally, type ReviewAnalysisResult } from "../review.analysis";
import returnsTimeline from "../returns_timeline.json";

// 리뷰 분석: coupang_performance에서 리뷰 관련 필드
type CoupangPerformance = Tables<"coupang_performance">;
type ReviewRow = Pick<
  CoupangPerformance,
  | "coupang_sku_id"
  | "sku_name"
  | "review_count"
  | "avg_rating"
  | "units_sold"
  | "return_units"
  | "date"
>;

const fallbackReviewRows: ReviewRow[] = [
  {
    coupang_sku_id: 63216406,
    sku_name: "하루온 붙이는 핫팩 10p",
    review_count: 210,
    avg_rating: 4.4,
    units_sold: 1600,
    return_units: 26,
    date: "2026-04-01",
  },
  {
    coupang_sku_id: 62936075,
    sku_name: "하루온 파스형 붙이는 핫팩 100개",
    review_count: 132,
    avg_rating: 4.1,
    units_sold: 980,
    return_units: 21,
    date: "2026-04-02",
  },
  {
    coupang_sku_id: 2298273,
    sku_name: "지엘 박상병 손난로 핫팩 10개",
    review_count: 178,
    avg_rating: 3.8,
    units_sold: 1210,
    return_units: 42,
    date: "2026-04-03",
  },
  {
    coupang_sku_id: 38679042,
    sku_name: "Pack 하루온팩 발난로 15팩",
    review_count: 96,
    avg_rating: 4.6,
    units_sold: 760,
    return_units: 9,
    date: "2026-04-04",
  },
];

function expandPerformanceToEntries(rows: ReviewRow[]): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  for (const row of rows) {
    const count = Math.max(1, Number(row.review_count ?? 0));
    const avgRating = Number(row.avg_rating ?? 0);
    const skuId = String(row.coupang_sku_id ?? "");
    const productName = String(row.sku_name ?? "미정 상품");
    const date = String(row.date ?? "2026-04-01");

    const lowPortion = Math.max(0, Math.min(0.4, (4.7 - avgRating) / 4));
    const lowCount = Math.round(count * lowPortion);
    const highCount = Math.max(count - lowCount, 1);

    for (let i = 0; i < lowCount; i += 1) {
      entries.push({
        id: `${skuId}-low-${date}-${i}`,
        sku_id: skuId,
        platform: "coupang",
        product_name: productName,
        rating: i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3,
        content:
          i % 2 === 0
            ? "포장이 찢어져서 도착했고 발열이 약합니다."
            : "지속 시간이 짧고 규격이 기대보다 작아요.",
        date,
      });
    }

    for (let i = 0; i < highCount; i += 1) {
      entries.push({
        id: `${skuId}-high-${date}-${i}`,
        sku_id: skuId,
        platform: "coupang",
        product_name: productName,
        rating: i % 2 === 0 ? 5 : 4,
        content:
          i % 2 === 0 ? "발열이 빠르고 오래가서 재구매했습니다." : "가격 대비 성능이 좋아요.",
        date,
      });
    }
  }
  return entries;
}

export function useReviews() {
  const [data, setData] = useState<ReviewRow[]>([]);
  const [analysis, setAnalysis] = useState<ReviewAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("coupang_performance")
        .select(
          "coupang_sku_id, sku_name, review_count, avg_rating, units_sold, return_units, date"
        )
        .order("date", { ascending: false })
        .limit(500);

      if (error) {
        setError(`실데이터 조회 실패로 샘플 데이터로 대체: ${error.message}`);
        setData(fallbackReviewRows);
        setLoading(false);
        return;
      }

      setData((data as ReviewRow[]) ?? []);
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  useEffect(() => {
    const buildAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const baseRows = data.length > 0 ? data : fallbackReviewRows;
        const normalizedRows: ReviewEntry[] = expandPerformanceToEntries(baseRows);

        const localResult = analyzeReviewsLocally(
          normalizedRows,
          returnsTimeline as { date: string; reason: string }[]
        );
        setAnalysis(localResult);
      } catch (fetchError) {
        setAnalysisError(
          fetchError instanceof Error ? fetchError.message : "리뷰 분석 결과를 생성하지 못했습니다."
        );
      } finally {
        setAnalysisLoading(false);
      }
    };

    buildAnalysis();
  }, [data]);

  return { data, loading, error, analysis, analysisLoading, analysisError };
}
