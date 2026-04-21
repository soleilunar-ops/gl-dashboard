"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  loadRoiDataset,
  type RoiMonthlyPoint,
} from "@/components/analytics/promotion/dataPreprocess";

const chartConfig = {
  couponRoi: { label: "쿠폰 ROI", color: "#3b82f6" },
  adRoi: { label: "광고 ROI", color: "#f97316" },
  milkRunRoi: { label: "밀크런 ROI", color: "#22c55e" },
  totalRoi: { label: "총 ROI", color: "#dc2626" },
} satisfies ChartConfig;

interface Row extends RoiMonthlyPoint {
  totalRoi: number | null;
  couponRoi: number | null;
  adRoi: number | null;
  milkRunRoi: number | null;
}

export default function ROICalculator() {
  const [margin, setMargin] = useState(30);
  const [rows, setRows] = useState<RoiMonthlyPoint[]>([]);

  useEffect(() => {
    loadRoiDataset().then((d) => setRows(d.points));
  }, []);

  const data = useMemo<Row[]>(() => {
    const p = margin / 100;
    return rows.map((r) => {
      const profit = r.supplyAmount * p;
      return {
        ...r,
        totalRoi: r.totalCost > 0 ? profit / r.totalCost : null,
        couponRoi: r.couponCost > 0 ? profit / r.couponCost : null,
        adRoi: r.adCost > 0 ? profit / r.adCost : null,
        milkRunRoi: r.milkRunCost > 0 ? profit / r.milkRunCost : null,
      };
    });
  }, [margin, rows]);

  const summary = useMemo(() => {
    const s24 = data
      .filter((r) => r.monthKey >= "2024-09" && r.monthKey <= "2025-03")
      .map((r) => r.totalRoi)
      .filter((v): v is number => v !== null);
    const s25 = data
      .filter((r) => r.monthKey >= "2025-09" && r.monthKey <= "2026-02")
      .map((r) => r.totalRoi)
      .filter((v): v is number => v !== null);
    const avg24 = s24.length ? s24.reduce((a, b) => a + b, 0) / s24.length : null;
    const avg25 = s25.length ? s25.reduce((a, b) => a + b, 0) / s25.length : null;
    const max = data
      .filter((r) => r.totalRoi !== null)
      .reduce<{ label: string; val: number } | null>((m, r) => {
        if (r.totalRoi === null) return m;
        if (!m || r.totalRoi > m.val) return { label: r.label, val: r.totalRoi };
        return m;
      }, null);
    return { avg24, avg25, max };
  }, [data]);

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>기능 3. 실비용 기반 ROI 계산</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">마진율 {margin}%</span>
            <Input
              type="range"
              min={10}
              max={60}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          </label>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            <div className="rounded border p-3">
              24시즌 평균ROI {summary.avg24 ? `${summary.avg24.toFixed(2)}x` : "-"}
            </div>
            <div className="rounded border p-3">
              25시즌 평균ROI {summary.avg25 ? `${summary.avg25.toFixed(2)}x` : "-"}
            </div>
            <div className="rounded border p-3">
              최고ROI 월{" "}
              {summary.max ? `${summary.max.label} (${summary.max.val.toFixed(2)}x)` : "-"}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="pt-4">
          <ChartContainer className="h-[360px] w-full" config={chartConfig}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="couponRoi" fill="#3b82f6" />
              <Bar dataKey="adRoi" fill="#f97316" />
              <Bar dataKey="milkRunRoi" fill="#22c55e" />
              <Line dataKey="totalRoi" stroke="#dc2626" strokeWidth={2} />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
