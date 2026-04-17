"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  loadTimingOptimizerDataset,
  type TimingCampaignMetric,
} from "@/components/analytics/promotion/dataPreprocess";

const lineChartConfig = {
  salesAmount: { label: "주별 판매액", color: "#2563eb" },
} satisfies ChartConfig;

const TIMELINE_START = new Date("2025-10-01");
const TIMELINE_END = new Date("2026-02-28");
const TIMELINE_RANGE_DAYS =
  (TIMELINE_END.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24);

export default function TimingOptimizer() {
  const [campaigns, setCampaigns] = useState<TimingCampaignMetric[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    loadTimingOptimizerDataset().then((d) => {
      setCampaigns(d.campaigns);
      setText(d.recommendationText);
    });
  }, []);

  const ranking = useMemo(
    () => [...campaigns].sort((a, b) => b.twoWeekGrowthRate - a.twoWeekGrowthRate),
    [campaigns]
  );

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>기능 4-B. 프로모션 타이밍 최적화 추천</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 text-sm font-medium">{text}</CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card size="sm" className="xl:col-span-2">
          <CardContent className="space-y-3 pt-4">
            {campaigns.map((c) => (
              <Lane key={c.id} c={c} />
            ))}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>반응 속도 랭킹</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-sm">
            {ranking.map((r, i) => (
              <div key={r.id} className="rounded border p-3">
                {i + 1}. {r.label} / {r.twoWeekGrowthRate.toFixed(2)}%
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Lane({ c }: { c: TimingCampaignMetric }) {
  const start = new Date(c.startDate);
  const end = new Date(c.endDate);
  const startOffset =
    ((start.getTime() - TIMELINE_START.getTime()) / (1000 * 60 * 60 * 24) / TIMELINE_RANGE_DAYS) *
    100;
  const duration =
    ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) / TIMELINE_RANGE_DAYS) * 100;
  return (
    <div className="rounded border p-3">
      <p className="font-medium">{c.label}</p>
      <div className="bg-muted/60 relative mt-1 mb-2 h-5 rounded">
        <div
          className="absolute top-0 h-5 rounded bg-blue-500/70"
          style={{ left: `${Math.max(0, startOffset)}%`, width: `${Math.max(2, duration)}%` }}
        />
      </div>
      <ChartContainer className="h-24 w-full" config={lineChartConfig}>
        <LineChart data={c.weeklySeries}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            dataKey="salesAmount"
            stroke="var(--color-salesAmount)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
