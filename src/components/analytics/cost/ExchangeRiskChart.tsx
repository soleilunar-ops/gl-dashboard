"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EXCHANGE_SENSITIVITY_MAX, EXCHANGE_SENSITIVITY_MIN } from "@/lib/margin/useMarginCalc";

const chartConfig = {
  marginRate: { label: "마진율(%)", color: "hsl(221 83% 53%)" },
  profitPerUnit: { label: "개당 순이익(원)", color: "hsl(142 71% 36%)" },
} satisfies ChartConfig;

export interface ExchangeRiskChartProps {
  exchangeRiskSeries: Array<{
    rate: number;
    marginRate: number;
    profitPerUnit: number;
  }>;
}

export function ExchangeRiskChart({ exchangeRiskSeries }: ExchangeRiskChartProps) {
  return (
    <Card size="sm">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            산출
          </Badge>
          <CardTitle>환율 민감도 (역산 노출가 고정)</CardTitle>
        </div>
        <CardDescription>
          입력 조건 유지 · CNY/KRW {EXCHANGE_SENSITIVITY_MIN}~{EXCHANGE_SENSITIVITY_MAX} 시뮬 · 좌
          마진율(%) / 우 개당순이익(원)
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <ChartContainer className="h-64 w-full" config={chartConfig}>
          <AreaChart data={exchangeRiskSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="rate" />
            <YAxis
              yAxisId="left"
              tickFormatter={(v) => `${v}%`}
              domain={["auto", "auto"]}
              width={48}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `${Number(v).toLocaleString("ko-KR")}`}
              width={56}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <ReferenceLine
              yAxisId="left"
              y={2}
              stroke="var(--destructive)"
              strokeDasharray="4 4"
              label={{ value: "위험선 2%", fill: "var(--destructive)", fontSize: 11 }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="marginRate"
              stroke="hsl(221 83% 53%)"
              fill="hsl(221 83% 53%)"
              fillOpacity={0.2}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="profitPerUnit"
              stroke="hsl(142 71% 36%)"
              fill="hsl(142 71% 36%)"
              fillOpacity={0.12}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
