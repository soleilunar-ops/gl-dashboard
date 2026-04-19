"use client";

import { useEffect, useState } from "react";
import { FASTAPI_URL } from "@/lib/constants";

// FastAPI /forecast/daily-sales 응답
export type DailySales = {
  sale_date: string;
  units_sold: number;
  gmv: number;
};

// FastAPI /forecast/weekly-prediction 응답 (34 SKU 합산 스케일)
export type WeeklyPrediction = {
  week_start: string;
  predicted_qty: number;
  source: string; // "winter_validation" | "model_b_future"
};

type UseForecastOptions = {
  limit?: number;
};

/**
 * 34개 핫팩 SKU 일별 판매(daily_performance) + 주차별 예측(Model A) 로드.
 *
 * 데이터 소스:
 * - 실판매: FastAPI /forecast/daily-sales → daily_performance 집계 (Supabase)
 * - 예측: FastAPI /forecast/weekly-prediction → data/processed/forecast_latest.csv
 */
export function useForecast(options: UseForecastOptions = {}) {
  const { limit = 400 } = options;

  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [predictions, setPredictions] = useState<WeeklyPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      try {
        const [salesRes, predRes] = await Promise.all([
          fetch(`${FASTAPI_URL}/forecast/daily-sales?limit=${limit}`),
          fetch(`${FASTAPI_URL}/forecast/weekly-prediction`),
        ]);

        if (!salesRes.ok) {
          throw new Error(`판매 데이터 조회 실패 (${salesRes.status})`);
        }
        if (!predRes.ok) {
          throw new Error(`예측 데이터 조회 실패 (${predRes.status})`);
        }

        const sales: DailySales[] = await salesRes.json();
        const preds: WeeklyPrediction[] = await predRes.json();

        setDailySales(sales);
        setPredictions(preds);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "알 수 없는 오류";
        setError(`${msg}. FastAPI 서버(localhost:8000)가 기동 중인지 확인하세요.`);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [limit]);

  return { dailySales, predictions, loading, error };
}
