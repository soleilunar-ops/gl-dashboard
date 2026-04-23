"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { MarginResult } from "./_hooks/useMarginCalc";

type Props = {
  result: MarginResult;
  referencePriceVAT?: number;
};

/** 현재가 진단 카드 — 변경 이유: 역산용 노출가 기반 실질 마진 표시 */
export default function CurrentPriceCard({ result, referencePriceVAT }: Props) {
  const hasRef = referencePriceVAT !== undefined && referencePriceVAT > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold tracking-tight">현재가 진단</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasRef ? (
          <p className="text-muted-foreground text-sm">
            시장 조건의 &quot;역산용 노출가&quot;를 입력하면 현재가 기준 실제 마진을 분석합니다.
          </p>
        ) : (
          <>
            <Row
              label="실제 마진율"
              value={
                result.currentMargin !== undefined
                  ? `${(result.currentMargin * 100).toFixed(1)}%`
                  : "—"
              }
              alert={(result.currentMargin ?? 0) < 0.02}
            />
            <Row
              label="개당 순익"
              value={
                result.currentProfit !== undefined
                  ? `${Math.round(result.currentProfit).toLocaleString("ko-KR")}원`
                  : "—"
              }
            />
            <Row
              label="실질 정산액"
              value={
                result.currentPayout !== undefined
                  ? `${Math.round(result.currentPayout).toLocaleString("ko-KR")}원`
                  : "—"
              }
            />
            <Row
              label="적용 ExFinal"
              value={result.exFinal > 0 ? result.exFinal.toFixed(1) : "—"}
            />

            <div className="border-t pt-3">
              {result.priceGapToTarget === 0 ? (
                <p className="text-sm font-medium text-emerald-600">✓ 목표 마진 달성</p>
              ) : (
                <p className="text-sm font-medium text-amber-600">
                  +{Math.round(result.priceGapToTarget ?? 0).toLocaleString("ko-KR")}원 인상 필요
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${alert ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );
}
