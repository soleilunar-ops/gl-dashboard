"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  loadBudgetPlannerReference,
  type BudgetPlannerReference,
} from "@/components/analytics/promotion/dataPreprocess";

const PIE_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7"];

const BASE = {
  rate24: 15.57,
  rate25: 16.3,
  share24: { coupon: 47.2, ad: 39.3, milkRun: 11.4, premium: 2.1 },
  share25: { coupon: 45.0, ad: 41.0, milkRun: 12.9, premium: 1.2 },
};

export default function BudgetPlanner() {
  const weightedRate = BASE.rate24 * 0.4 + BASE.rate25 * 0.6;
  const weightedShare = {
    coupon: BASE.share24.coupon * 0.4 + BASE.share25.coupon * 0.6,
    ad: BASE.share24.ad * 0.4 + BASE.share25.ad * 0.6,
    milkRun: BASE.share24.milkRun * 0.4 + BASE.share25.milkRun * 0.6,
    premium: BASE.share24.premium * 0.4 + BASE.share25.premium * 0.6,
  };

  const [ref, setRef] = useState<BudgetPlannerReference | null>(null);
  const [sales, setSales] = useState(5000000000);
  const [rate, setRate] = useState(Number(weightedRate.toFixed(2)));
  const [months, setMonths] = useState<5 | 6 | 7>(7);

  useEffect(() => {
    loadBudgetPlannerReference().then(setRef);
  }, []);

  const rows = useMemo(() => {
    if (!ref) return [];
    const selected = ref.season25MonthlyWeights.slice(0, months);
    const totalWeight = selected.reduce((s, w) => s + w.weight, 0);
    const totalBudget = sales * (rate / 100);
    return selected.map((s) => {
      const w = totalWeight > 0 ? s.weight / totalWeight : 1 / selected.length;
      const monthTotal = totalBudget * w;
      return {
        label: `${s.seasonMonthIndex}월차`,
        coupon: monthTotal * (weightedShare.coupon / 100),
        ad: monthTotal * (weightedShare.ad / 100),
        milkRun: monthTotal * (weightedShare.milkRun / 100),
        total: monthTotal,
      };
    });
  }, [months, rate, ref, sales, weightedShare.ad, weightedShare.coupon, weightedShare.milkRun]);

  const pieData = [
    { name: "쿠폰", value: weightedShare.coupon },
    { name: "광고", value: weightedShare.ad },
    { name: "밀크런", value: weightedShare.milkRun },
    { name: "프리미엄", value: weightedShare.premium },
  ];

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>기능 4-A. 목표 역산 예산 플래너</CardTitle>
          <CardDescription>가중평균 비용률 기본값 적용</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 pt-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-muted-foreground text-xs">목표 매출</span>
            <Input
              type="number"
              value={sales}
              onChange={(e) => setSales(Number(e.target.value) || 0)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground text-xs">비용률 {rate.toFixed(2)}%</span>
            <Input
              type="range"
              min={10}
              max={25}
              step={0.01}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">월수</span>
            <div className="flex gap-1">
              {[5, 6, 7].map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={months === m ? "default" : "outline"}
                  onClick={() => setMonths(m as 5 | 6 | 7)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">초기화</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSales(5000000000);
                setRate(Number(weightedRate.toFixed(2)));
                setMonths(7);
              }}
            >
              초기화
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="pt-4">
          <div className="overflow-x-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시즌 월차</TableHead>
                  <TableHead>쿠폰예산</TableHead>
                  <TableHead>광고예산</TableHead>
                  <TableHead>밀크런예산</TableHead>
                  <TableHead>월합계</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell>{Math.round(r.coupon).toLocaleString()}원</TableCell>
                    <TableCell>{Math.round(r.ad).toLocaleString()}원</TableCell>
                    <TableCell>{Math.round(r.milkRun).toLocaleString()}원</TableCell>
                    <TableCell>{Math.round(r.total).toLocaleString()}원</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex justify-center pt-4">
          <PieChart width={380} height={260}>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={85}
              label={(e) => `${e.name} ${Number(e.value).toFixed(1)}%`}
            >
              {pieData.map((d, i) => (
                <Cell key={d.name} fill={PIE_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) =>
                value === undefined || value === null ? "-" : `${Number(value).toFixed(2)}%`
              }
            />
          </PieChart>
        </CardContent>
      </Card>
    </div>
  );
}
