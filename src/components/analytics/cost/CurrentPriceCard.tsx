"use client";

// 현재가 진단 카드 (지호 v0.5) — 목표 마진율 달성 여부 + 자연어 진단
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { MarginResult } from "./_hooks/useMarginCalc";

type Props = {
  result: MarginResult;
};

const LEVEL_STYLES: Record<MarginResult["diagnosis"]["level"], { badge: string; box: string }> = {
  excellent: {
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    box: "border-emerald-200 bg-emerald-50",
  },
  good: {
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    box: "border-sky-200 bg-sky-50",
  },
  warning: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    box: "border-amber-200 bg-amber-50",
  },
  critical: {
    badge: "bg-red-100 text-red-700 border-red-200",
    box: "border-red-200 bg-red-50",
  },
};

export default function CurrentPriceCard({ result }: Props) {
  if (result.isInfeasible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold tracking-tight">현재가 진단</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          판매가와 판매 채널을 입력하면 목표 마진율 달성 여부를 진단합니다.
        </CardContent>
      </Card>
    );
  }

  const { diagnosis, currentMargin, isTargetMet, gapToTarget } = result;
  const styles = LEVEL_STYLES[diagnosis.level];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold tracking-tight">현재가 진단</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <MetricCell label="실제 마진율" value={`${(currentMargin * 100).toFixed(1)}%`} />
          <MetricCell
            label="목표 대비"
            value={`${gapToTarget >= 0 ? "+" : ""}${(gapToTarget * 100).toFixed(1)}%p`}
            emphasis={gapToTarget >= 0 ? "positive" : "negative"}
          />
          <MetricCell
            label="개당 순익"
            value={`${Math.round(result.unitProfit).toLocaleString("ko-KR")}원`}
            emphasis={result.unitProfit >= 0 ? undefined : "negative"}
          />
          <MetricCell
            label="총원가"
            value={`${Math.round(result.totalCostPerUnit).toLocaleString("ko-KR")}원`}
          />
        </div>

        <div className={`rounded-md border p-3 ${styles.box}`}>
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles.badge}`}
            >
              {isTargetMet ? "✓ 달성" : "미달"}
            </span>
            <span className="text-sm font-semibold">{diagnosis.headline}</span>
          </div>
          <p className="text-xs text-gray-700">{diagnosis.detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "positive" | "negative";
}) {
  const color =
    emphasis === "positive"
      ? "text-emerald-600"
      : emphasis === "negative"
        ? "text-red-600"
        : "text-gray-900";
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className={`mt-0.5 text-lg font-bold [font-variant-numeric:tabular-nums] ${color}`}>
        {value}
      </p>
    </div>
  );
}
