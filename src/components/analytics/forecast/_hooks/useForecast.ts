"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type CoupangPerformance = Database["public"]["Tables"]["coupang_performance"]["Row"];
type Forecast = Database["public"]["Tables"]["forecasts"]["Row"];

type UseForecastOptions = {
  // 핫팩(보온소품) SKU만 필터링할지 여부
  warmersOnly?: boolean;
  // 조회 행 제한
  limit?: number;
};

export function useForecast(options: UseForecastOptions = {}) {
  const { warmersOnly = true, limit = 100 } = options;

  const [performance, setPerformance] = useState<CoupangPerformance[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 쿠팡 성과 데이터 조회 — 컬럼명은 date (sale_date 아님)
      let perfQuery = supabase
        .from("coupang_performance")
        .select("*")
        .order("date", { ascending: false })
        .limit(limit);

      if (warmersOnly) {
        // 핫팩 관련 카테고리만 (category_l3 기준 보온소품)
        perfQuery = perfQuery.eq("category_l3", "보온소품");
      }

      const { data: perfData, error: perfError } = await perfQuery;

      if (perfError) {
        setError(`성과 데이터 조회 실패: ${perfError.message}`);
        setLoading(false);
        return;
      }

      // 수요예측 결과 조회
      const { data: forecastData, error: forecastError } = await supabase
        .from("forecasts")
        .select("*")
        .order("forecast_date", { ascending: false })
        .limit(limit);

      if (forecastError) {
        setError(`예측 데이터 조회 실패: ${forecastError.message}`);
        setLoading(false);
        return;
      }

      setPerformance(perfData ?? []);
      setForecasts(forecastData ?? []);
      setLoading(false);
    };

    fetchData();
  }, [warmersOnly, limit]);

  return { performance, forecasts, loading, error };
}
