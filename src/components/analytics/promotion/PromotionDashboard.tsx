"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePromotion } from "./_hooks/usePromotion";

const MONTH_LABELS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

const platformEvents = [
  { platform: "쿠팡", event: "와우 할인전", period: "매월 2주차", status: "연동 준비" },
  { platform: "네이버", event: "쇼핑 페스타", period: "매월 말", status: "크롤링 대기" },
  { platform: "카카오", event: "메이커스 기획전", period: "격주", status: "수동 등록" },
];

export default function PromotionDashboard() {
  const { data, loading, error } = usePromotion();

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; units: number; promoCost: number }>();
    data.forEach((row) => {
      const date = new Date(row.date);
      const month = `${date.getFullYear()}-${MONTH_LABELS[date.getMonth()]}`;
      const prev = map.get(month) ?? { month, units: 0, promoCost: 0 };
      prev.units += row.units_sold ?? 0;
      prev.promoCost += (row.coupon_discount ?? 0) + (row.instant_discount ?? 0);
      map.set(month, prev);
    });
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-8);
  }, [data]);

  const yearCompareData = useMemo(() => {
    const map = new Map<string, { label: string; y2024: number; y2025: number }>();
    data.forEach((row) => {
      const date = new Date(row.date);
      const year = date.getFullYear();
      if (year !== 2024 && year !== 2025) return;
      const monthKey = MONTH_LABELS[date.getMonth()];
      const prev = map.get(monthKey) ?? { label: monthKey, y2024: 0, y2025: 0 };
      if (year === 2024) prev.y2024 += row.units_sold ?? 0;
      if (year === 2025) prev.y2025 += row.units_sold ?? 0;
      map.set(monthKey, prev);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const kpi = useMemo(() => {
    const promoCost = data.reduce(
      (sum, row) => sum + (row.coupon_discount ?? 0) + (row.instant_discount ?? 0),
      0
    );
    const promoSales = data.reduce((sum, row) => sum + (row.promo_gmv ?? 0), 0);
    const totalSales = data.reduce((sum, row) => sum + (row.gmv ?? 0), 0);
    const roi = promoCost > 0 ? ((promoSales - promoCost) / promoCost) * 100 : 0;
    const correlationHint =
      monthlyData.length > 1
        ? monthlyData.reduce(
            (acc, item) => acc + (item.units > 0 && item.promoCost > 0 ? 1 : 0),
            0
          ) / monthlyData.length
        : 0;

    return {
      promoCost,
      promoSales,
      totalSales,
      roi,
      correlationHint,
    };
  }, [data, monthlyData]);

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>데이터 조회 실패</AlertTitle>
          <AlertDescription>
            원인: Supabase `coupang_performance` 조회 중 오류가 발생했습니다. 해결책: DB 연결 상태와
            테이블 권한, 컬럼명을 확인해주세요.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>프로모션 총비용</CardDescription>
            <CardTitle>₩{Math.round(kpi.promoCost).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>프로모션 매출</CardDescription>
            <CardTitle>₩{Math.round(kpi.promoSales).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>단순 ROI</CardDescription>
            <CardTitle>{kpi.roi.toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>프로모션-판매 연동 지표</CardDescription>
            <CardTitle>{(kpi.correlationHint * 100).toFixed(0)}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>월별 프로모션 비용 vs 판매량</CardTitle>
            <CardDescription>광고/쿠폰 투입과 판매량을 오버레이로 비교합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{
                units: { label: "판매량", color: "var(--chart-1)" },
                promoCost: { label: "프로모션 비용", color: "var(--chart-2)" },
              }}
            >
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="units"
                  fill="var(--color-units)"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="promoCost"
                  stroke="var(--color-promoCost)"
                />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>24년 vs 25년 월별 판매량 비교</CardTitle>
            <CardDescription>2개년 시즌 변화를 같은 축에서 비교합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px] w-full"
              config={{
                y2024: { label: "2024", color: "var(--chart-3)" },
                y2025: { label: "2025", color: "var(--chart-4)" },
              }}
            >
              <BarChart data={yearCompareData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="y2024" fill="var(--color-y2024)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="y2025" fill="var(--color-y2025)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>플랫폼 행사 알림</CardTitle>
          <CardDescription>
            PDF 요청사항에 맞춰 프로모션 탭 하단에 행사 캘린더 영역을 배치했습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {platformEvents.map((item) => (
              <div key={`${item.platform}-${item.event}`} className="rounded-lg border p-3">
                <p className="font-medium">{item.platform}</p>
                <p className="text-sm">{item.event}</p>
                <p className="text-muted-foreground text-xs">{item.period}</p>
                <p className="mt-2 text-xs">{item.status}</p>
              </div>
            ))}
          </div>
          {loading && <p className="text-muted-foreground mt-3 text-sm">데이터 불러오는 중...</p>}
        </CardContent>
      </Card>
    </>
  );
}
