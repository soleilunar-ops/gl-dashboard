"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarginStrategyCards } from "@/components/analytics/cost/MarginStrategyCards";
import { roundCurrency, type ChannelKey } from "@/lib/margin/useMarginCalc";

interface CurrentProfit {
  marginRate: number;
  profitPerUnit: number;
}

export interface PricingCompetitionCardsProps {
  unitCostCny: number;
  exPi: number;
  exCurrent: number;
  shipmentQty: number;
  totalQty: number;
  palletReworkCost: number;
  centerName: string;
  pcsPerPallet: number;
  channel: ChannelKey;
  ownPricePer10g: number;
  competitorPricePer10g: number;
  canWinItemWinner: boolean;
  currentProfit: CurrentProfit;
}

export function PricingCompetitionCards({
  unitCostCny,
  exPi,
  exCurrent,
  shipmentQty,
  totalQty,
  palletReworkCost,
  centerName,
  pcsPerPallet,
  channel,
  ownPricePer10g,
  competitorPricePer10g,
  canWinItemWinner,
  currentProfit,
}: PricingCompetitionCardsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card size="sm">
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              산출
            </Badge>
            <CardTitle>전략별 권장 판매가</CardTitle>
          </div>
          <CardDescription>목표 마진 시나리오(보수·안정·공격)별 권장 VAT 가격</CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          <MarginStrategyCards
            cnyCostPerUnit={unitCostCny}
            exPI={exPi}
            exCurrent={exCurrent}
            qShip={shipmentQty}
            qTotal={totalQty}
            palletReworkCost={palletReworkCost}
            centerName={centerName}
            pcsPerPallet={pcsPerPallet}
            channel={channel}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              산출
            </Badge>
            <CardTitle>가격 경쟁력 · 아이템 위너</CardTitle>
          </div>
          <CardDescription>역산 노출가·경쟁가 기준 10g당 단가 비교</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-muted-foreground text-xs">산출: 우리 10g당 단가</p>
              <p className="text-base font-semibold">{ownPricePer10g.toFixed(1)}원</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">입력: 경쟁사 10g당 단가</p>
              <p className="text-base font-semibold">{competitorPricePer10g.toFixed(1)}원</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">아이템 위너 가능성 (산출)</span>
            <Badge variant={canWinItemWinner ? "default" : "destructive"}>
              {canWinItemWinner ? "확보 가능" : "가격 열위"}
            </Badge>
          </div>
          <div
            className={`rounded-lg border p-3 text-sm ${
              currentProfit.marginRate < 0.02
                ? "border-red-500 bg-red-50 text-red-600"
                : "text-muted-foreground"
            }`}
          >
            <p className="font-medium">역산 노출가 기준 마진 (산출)</p>
            <p className="mt-1">
              순마진율: {(currentProfit.marginRate * 100).toFixed(2)}% · 개당 순이익:{" "}
              {roundCurrency(currentProfit.profitPerUnit).toLocaleString()}원
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
