"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  loadSeasonCompareDataset,
  type SeasonComparePoint,
} from "@/components/analytics/promotion/dataPreprocess";

const chartConfig = {
  salesQty: { label: "판매수량(EA)", color: "#2563eb" },
  costRate: { label: "비용률(%)", color: "#dc2626" },
} satisfies ChartConfig;

export default function SeasonCompare() {
  const [data24, setData24] = useState<SeasonComparePoint[]>([]);
  const [data25, setData25] = useState<SeasonComparePoint[]>([]);

  useEffect(() => {
    loadSeasonCompareDataset().then((dataset) => {
      setData24(dataset.season24);
      setData25(dataset.season25);
    });
  }, []);

  const yoy = useMemo(() => {
    const sum = (rows: SeasonComparePoint[]) => ({
      sales: rows.reduce((s, r) => s + r.salesQty, 0),
      costRate: rows.length ? rows.reduce((s, r) => s + r.costRate, 0) / rows.length : 0,
      cost: rows.reduce((s, r) => s + r.totalCost, 0),
    });
    const a = sum(data24);
    const b = sum(data25);
    return {
      salesRate: a.sales > 0 ? ((b.sales - a.sales) / a.sales) * 100 : 0,
      costRateDiff: b.costRate - a.costRate,
      totalCostRate: a.cost > 0 ? ((b.cost - a.cost) / a.cost) * 100 : 0,
    };
  }, [data24, data25]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SeasonPanel title="기능 2. 24시즌 비교" data={data24} baseline={15.57} />
        <SeasonPanel title="기능 2. 25시즌 비교" data={data25} baseline={16.3} />
      </div>
      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>YoY 요약</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 pt-3 text-sm md:grid-cols-3">
          <div className="rounded border p-3">판매수량 증감률 {yoy.salesRate.toFixed(2)}%</div>
          <div className="rounded border p-3">비용률 변화 {yoy.costRateDiff.toFixed(2)}%p</div>
          <div className="rounded border p-3">총비용 증감률 {yoy.totalCostRate.toFixed(2)}%</div>
        </CardContent>
      </Card>
    </div>
  );
}

function SeasonPanel({
  title,
  data,
  baseline,
}: {
  title: string;
  data: SeasonComparePoint[];
  baseline: number;
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-0">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <ChartContainer className="h-[320px] w-full" config={chartConfig}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="seasonMonthLabel" />
            <YAxis yAxisId="left" tickFormatter={(v) => `${(v / 10000).toFixed(1)}만`} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v.toFixed(1)}%`} />
            <ReferenceLine yAxisId="right" y={baseline} stroke="#dc2626" strokeDasharray="6 4" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar yAxisId="left" dataKey="salesQty" fill="#2563eb">
              <LabelList dataKey="isEventOn" position="top" formatter={(v) => (v ? "ON" : "")} />
            </Bar>
            <Line yAxisId="right" dataKey="costRate" stroke="#dc2626" strokeWidth={2} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
