"use client";

import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle, CalendarRange, Sparkles, Package } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useForecast } from "./_hooks/useForecast";
import { FASTAPI_URL } from "@/lib/constants";

export default function ForecastDashboard() {
  const { performance, forecasts, loading, error } = useForecast({
    warmersOnly: true,
    limit: 5000,
  });
  const { insight, insightLoading } = useInsight();

  const salesSeries = aggregateDailySales(performance);
  const forecastSeries = forecasts
    .filter((f) => f.predicted_qty != null)
    .map((f) => ({
      date: f.forecast_date,
      predicted: f.predicted_qty,
    }))
    .reverse();

  const totalUnits = performance.reduce((acc, r) => acc + (r.units_sold ?? 0), 0);
  const totalGmv = performance.reduce((acc, r) => acc + Number(r.gmv ?? 0), 0);
  const latestForecastQty = forecasts[0]?.predicted_qty ?? null;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">수요 예측 (핫팩)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          보온소품 SKU 판매 추이 · 예측 수량 · AI 인사이트
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>데이터 조회 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* AI 인사이트 카드 */}
      <InsightCard insight={insight} loading={insightLoading} />

      {/* KPI 행 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="최근 판매 수량 합계"
          value={loading ? "—" : totalUnits.toLocaleString()}
          icon={<TrendingUp className="text-muted-foreground h-4 w-4" />}
          hint={`최근 ${performance.length}건 기준`}
        />
        <KpiCard
          title="최근 GMV 합계"
          value={loading ? "—" : `₩${totalGmv.toLocaleString()}`}
          icon={<TrendingUp className="text-muted-foreground h-4 w-4" />}
          hint="정가 기준 매출"
        />
        <KpiCard
          title="다음 구간 예측 수량"
          value={
            loading
              ? "—"
              : latestForecastQty !== null
                ? latestForecastQty.toLocaleString()
                : "데이터 없음"
          }
          icon={<CalendarRange className="text-muted-foreground h-4 w-4" />}
          hint="forecasts 테이블 최신 1건"
        />
      </div>

      {/* 판매 추이 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>일별 판매 추이 (보온소품)</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : salesSeries.length === 0 ? (
            <EmptyHint text="판매 데이터가 없습니다. Supabase 연동 완료 후 표시됩니다." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesSeries} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="units"
                  name="판매수량"
                  stroke="#2563eb"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 예측 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>예측 수량 (forecasts)</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : forecastSeries.length === 0 ? (
            <EmptyHint text="아직 예측 결과가 없습니다. 모델 실행 완료 후 표시됩니다." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastSeries} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="예측수량"
                  stroke="#059669"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 발주 시뮬레이션 테이블 */}
      <OrderSimulationCard />
    </div>
  );
}

// ────────────────────────────────────────────
// AI 인사이트 카드
// ────────────────────────────────────────────
function InsightCard({ insight, loading }: { insight: string | null; loading: boolean }) {
  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-base font-semibold text-blue-900">AI 발주 인사이트</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!insight) {
    return (
      <Card className="border-gray-200 bg-gray-50/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Sparkles className="h-5 w-5 text-gray-400" />
          <CardTitle className="text-base text-gray-500">AI 발주 인사이트</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            FastAPI 서버(localhost:8000) 실행 후 인사이트가 표시됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <CardTitle className="text-base font-semibold text-blue-900">AI 발주 인사이트</CardTitle>
        <Badge variant="secondary" className="ml-auto text-xs">
          GPT-4o-mini
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-line">{insight}</p>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────
// 발주 시뮬레이션 카드 (Model B 결과 로컬 CSV)
// ────────────────────────────────────────────
function OrderSimulationCard() {
  const [data, setData] = useState<any[]>([]);
  const [simLoading, setSimLoading] = useState(true);

  useEffect(() => {
    fetch(`${FASTAPI_URL}/forecast/order-simulation`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setSimLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Package className="h-5 w-5 text-orange-600" />
        <CardTitle>발주 시뮬레이션 (Model B)</CardTitle>
      </CardHeader>
      <CardContent>
        {simLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : data.length === 0 ? (
          <EmptyHint text="FastAPI /forecast/order-simulation 엔드포인트 응답 대기 중" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium text-gray-500">
                  <th className="pb-2">주차</th>
                  <th className="pb-2">SKU</th>
                  <th className="pb-2">제품명</th>
                  <th className="pb-2 text-right">권장 발주량</th>
                  <th className="pb-2 text-right">비중</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 text-gray-600">{row.week_start?.slice(0, 10)}</td>
                    <td className="py-2 font-mono text-xs">{row.sku}</td>
                    <td className="py-2">{row.name || `SKU ${row.sku}`}</td>
                    <td className="py-2 text-right font-semibold">
                      {(row.predicted_order_qty ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {row.sku_ratio ? `${(row.sku_ratio * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────
// 인사이트 훅 (FastAPI /forecast/insight)
// ────────────────────────────────────────────
function useInsight() {
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    fetch(`${FASTAPI_URL}/forecast/insight`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInsight(d?.insight ?? null))
      .catch(() => setInsight(null))
      .finally(() => setInsightLoading(false));
  }, []);

  return { insight, insightLoading };
}

// ────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────
function KpiCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      {text}
    </div>
  );
}

function aggregateDailySales(
  rows: { date: string; units_sold: number }[]
): { date: string; units: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = r.date ?? (r as any).sale_date;
    if (!d) continue;
    const prev = map.get(d) ?? 0;
    map.set(d, prev + (r.units_sold ?? 0));
  }
  return Array.from(map.entries())
    .map(([date, units]) => ({ date, units }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
