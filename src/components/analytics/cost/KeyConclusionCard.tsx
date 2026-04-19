"use client";

import { Badge } from "@/components/ui/badge";
import { IoBlockHeader, OutputMetric } from "@/components/analytics/cost/NumberInput";
import { roundCurrency } from "@/lib/margin/useMarginCalc";

interface MarginSnapshot {
  exFinal: number;
  totalCostPerUnit: number;
  logisticsPerUnit: number;
  suggestedPriceVAT: number;
  profitPerUnit: number;
}

interface CurrentProfit {
  marginRate: number;
  profitPerUnit: number;
}

export interface KeyConclusionCardProps {
  displayProductName: string;
  channelLabel: string;
  centerName: string;
  recommendedPriceVat: number;
  stableProfitPerUnit: number;
  breakevenEx: number | null;
  canWinAtRecommended: boolean;
  competitorVatPrice: number;
  marginSnapshot: MarginSnapshot;
  currentProfit: CurrentProfit;
}

export function KeyConclusionCard({
  displayProductName,
  channelLabel,
  centerName,
  recommendedPriceVat,
  stableProfitPerUnit,
  breakevenEx,
  canWinAtRecommended,
  competitorVatPrice,
  marginSnapshot,
  currentProfit,
}: KeyConclusionCardProps) {
  return (
    <>
      <section className="border-primary bg-primary/5 rounded-lg border-2 p-5 shadow-sm">
        <p className="text-muted-foreground mb-1 text-xs font-medium">핵심 결론 (목표 마진 15%)</p>
        <h2 className="text-lg leading-snug font-semibold">
          {displayProductName} · {channelLabel} · {centerName}
        </h2>
        <div className="mt-4 text-4xl font-bold tabular-nums sm:text-5xl">
          {recommendedPriceVat.toLocaleString("ko-KR")}
          <span className="text-2xl font-semibold sm:text-3xl">원</span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">VAT 포함 · 권장 판매가</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <span>
            개당 순익{" "}
            <strong className="text-foreground font-semibold">
              {stableProfitPerUnit.toLocaleString("ko-KR")}원
            </strong>
          </span>
          {breakevenEx !== null ? (
            <span className="text-muted-foreground">
              환율 안전선(역산 노출가·마진 2%): 약 ₩
              {Math.round(breakevenEx).toLocaleString("ko-KR")}/CNY
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={canWinAtRecommended ? "default" : "destructive"}>
            {canWinAtRecommended
              ? `아이템 위너 가능 (경쟁 ${competitorVatPrice.toLocaleString("ko-KR")}원 대비)`
              : `가격 열위 (경쟁 ${competitorVatPrice.toLocaleString("ko-KR")}원 대비)`}
          </Badge>
        </div>
      </section>

      <details className="bg-muted/20 rounded-lg border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
          세부 지표 (ExFinal·원가·역산 노출가 기준 마진) — 펼치기
        </summary>
        <div className="border-t px-4 pt-2 pb-4">
          <IoBlockHeader variant="out" title="핵심 산출 (선택 채널·기준 센터)" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <OutputMetric
              label="분할 적용 환율 ExFinal"
              value={`${marginSnapshot.exFinal.toFixed(2)} KRW/CNY`}
            />
            <OutputMetric
              label="개당 총원가"
              value={`${roundCurrency(marginSnapshot.totalCostPerUnit).toLocaleString("ko-KR")}원`}
            />
            <OutputMetric
              label="개당 물류비"
              value={`${roundCurrency(marginSnapshot.logisticsPerUnit).toLocaleString("ko-KR")}원`}
            />
            <OutputMetric
              label="권장 판매가 VAT (목표마진 15%)"
              value={`${Math.round(marginSnapshot.suggestedPriceVAT).toLocaleString("ko-KR")}원`}
            />
            <OutputMetric
              label="역산 노출가 기준 순마진율"
              value={`${(currentProfit.marginRate * 100).toFixed(2)}%`}
            />
            <OutputMetric
              label="역산 노출가 기준 개당 순이익"
              value={`${roundCurrency(currentProfit.profitPerUnit).toLocaleString("ko-KR")}원`}
            />
          </div>
        </div>
      </details>
    </>
  );
}
