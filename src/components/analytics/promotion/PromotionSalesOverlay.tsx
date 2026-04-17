"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  loadPromotionSalesOverlayDataset,
  type PromotionSalesOverlayPoint,
} from "@/components/analytics/promotion/dataPreprocess";

const chartConfig = {
  couponCost: { label: "쿠폰", color: "#3b82f6" },
  adCost: { label: "광고비", color: "#f97316" },
  milkRunCost: { label: "밀크런", color: "#22c55e" },
  salesQty: { label: "판매수량", color: "#ef4444" },
} satisfies ChartConfig;

export default function PromotionSalesOverlay() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PromotionSalesOverlayPoint[]>([]);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        setLoading(true);
        setError(null);
        const dataset = await loadPromotionSalesOverlayDataset();
        if (!mounted) return;
        setData(dataset.points);
      } catch (caughtError) {
        if (!mounted) return;
        setError(
          caughtError instanceof Error ? caughtError.message : "데이터를 불러오지 못했습니다."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const season24Range = useMemo(() => {
    const indexes = data
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.isSeason24)
      .map(({ index }) => index);
    if (!indexes.length) return null;
    return { start: indexes[0], end: indexes[indexes.length - 1] };
  }, [data]);

  if (loading)
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>기능 1</CardTitle>
        </CardHeader>
      </Card>
    );
  if (error)
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>기능 1</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-600">{error}</CardContent>
      </Card>
    );

  return (
    <Card size="sm">
      <CardHeader className="pb-0">
        <CardTitle>기능 1. 프로모션-판매 상관관계 오버레이</CardTitle>
        <CardDescription>비용 스택바 + 판매수량 라인 오버레이</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <ChartContainer className="h-[360px] w-full" config={chartConfig}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis
              yAxisId="left"
              tickFormatter={(value) => `${(value / 100000000).toFixed(1)}억`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(value) => `${(value / 10000).toFixed(1)}만`}
            />
            {season24Range ? (
              <ReferenceArea
                x1={data[season24Range.start]?.label}
                x2={data[season24Range.end]?.label}
                yAxisId="left"
                fill="#60a5fa"
                fillOpacity={0.08}
              />
            ) : null}
            {season24Range ? (
              <ReferenceLine
                x={data[season24Range.start]?.label}
                yAxisId="left"
                stroke="transparent"
                label={{ value: "24시즌(보완데이터)", position: "insideTopLeft", fill: "#1d4ed8" }}
              />
            ) : null}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as PromotionSalesOverlayPoint | undefined;
                    if (!row) return String(label);
                    return `${label} | 총비용 ${row.totalCost.toLocaleString()}원`;
                  }}
                />
              }
            />
            <Bar yAxisId="left" dataKey="couponCost" stackId="cost" fill="#3b82f6" />
            <Bar yAxisId="left" dataKey="adCost" stackId="cost" fill="#f97316" />
            <Bar yAxisId="left" dataKey="milkRunCost" stackId="cost" fill="#22c55e" />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="salesQty"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
