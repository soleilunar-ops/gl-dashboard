"use client";

import { TrendingUp, AlertTriangle, CalendarRange } from "lucide-react";
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
import { useForecast } from "./_hooks/useForecast";

export default function ForecastDashboard() {
  const { performance, forecasts, loading, error } = useForecast({ warmersOnly: true, limit: 180 });

  // 일별 매출/판매수량 집계 (최근 날짜부터 역순이므로 차트용 reverse)
  const salesSeries = aggregateDailySales(performance);
  // 예측 시계열 (forecasts 테이블)
  const forecastSeries = forecasts
    .map((f) => ({
      date: f.forecast_date,
      predicted: f.predicted_qty ?? 0,
    }))
    .reverse();

  // KPI
  const totalUnits = performance.reduce((acc, r) => acc + (r.units_sold ?? 0), 0);
  const totalGmv = performance.reduce((acc, r) => acc + Number(r.gmv ?? 0), 0);
  const latestForecastQty = forecasts[0]?.predicted_qty ?? null;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">수요 예측 (핫팩)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          보온소품 SKU 판매 추이와 예측 수량. 추후 FastAPI `/forecast/run` 결과를 실시간 반영합니다.
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>데이터 조회 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
          value={loading ? "—" : latestForecastQty !== null ? latestForecastQty.toLocaleString() : "데이터 없음"}
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
            <EmptyHint text="판매 데이터가 없습니다. Step 3(Supabase 연동) 완료 후 표시됩니다." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesSeries} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="units" name="판매수량" stroke="#2563eb" dot={false} />
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
            <EmptyHint text="아직 예측 결과가 없습니다. Step 5~6(모델 실행) 완료 후 표시됩니다." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastSeries} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="predicted" name="예측수량" stroke="#059669" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">{text}</div>
  );
}

// 같은 날짜의 여러 SKU를 합쳐서 일별 시리즈로 변환
function aggregateDailySales(
  rows: { date: string; units_sold: number }[]
): { date: string; units: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const prev = map.get(r.date) ?? 0;
    map.set(r.date, prev + (r.units_sold ?? 0));
  }
  return Array.from(map.entries())
    .map(([date, units]) => ({ date, units }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
