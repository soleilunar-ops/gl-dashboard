"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHANNEL_RATES,
  calcMargin,
  type ChannelKey,
  type MarginCalcInput,
} from "@/lib/margin/useMarginCalc";

// 변경 이유: Claude 전략 카드 컴포넌트를 현재 프로젝트 구조와 타입에 맞게 분리 적용했습니다.
const STRATEGIES = [
  { label: "보수적", margin: 0.2, colorClass: "text-sky-500", description: "안전 마진 확보" },
  { label: "안정적", margin: 0.15, colorClass: "text-emerald-500", description: "목표 수익 달성" },
  { label: "공격적", margin: 0.05, colorClass: "text-amber-500", description: "아이템 위너 집중" },
] as const;

interface MarginStrategyCardsProps extends Omit<MarginCalcInput, "targetMargin"> {
  unitSizeG?: number;
  competitorPrice?: number;
}

export function MarginStrategyCards({
  unitSizeG = 10,
  competitorPrice,
  ...baseInput
}: MarginStrategyCardsProps) {
  const results = STRATEGIES.map((strategy) => {
    const calculated = calcMargin({ ...baseInput, targetMargin: strategy.margin });
    return { ...strategy, ...calculated };
  });

  const stableResult = results.find((result) => result.label === "안정적");
  const winnerAnalysis =
    stableResult && competitorPrice && competitorPrice > 0
      ? {
          myPricePer10g: (stableResult.suggestedPriceVAT / unitSizeG) * 10,
          competitorPricePer10g: (competitorPrice / unitSizeG) * 10,
        }
      : null;

  const canWin = winnerAnalysis
    ? winnerAnalysis.myPricePer10g <= winnerAnalysis.competitorPricePer10g
    : false;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {results.map((result) => (
          <Card
            key={result.label}
            size="sm"
            className={result.isMarginAlert ? "border-red-500" : undefined}
          >
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{result.label}</span>
                <span className={result.colorClass}>
                  {Math.round(result.suggestedPriceVAT).toLocaleString()}원
                </span>
              </CardTitle>
              <CardDescription>
                목표 마진 {(result.margin * 100).toFixed(0)}% · {result.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-3 text-xs">
              <MetricRow
                label="개당 총 원가"
                value={`${Math.round(result.totalCostPerUnit).toLocaleString()}원`}
              />
              <MetricRow
                label="물류비/개"
                value={`${Math.round(result.logisticsPerUnit).toLocaleString()}원`}
              />
              <MetricRow
                label="실질 정산액"
                value={`${Math.round(result.settlementAmount).toLocaleString()}원`}
              />
              <MetricRow
                label="개당 순익"
                value={`${Math.round(result.profitPerUnit).toLocaleString()}원`}
              />
              <MetricRow label="적용 환율" value={`${result.exFinal.toFixed(1)} KRW/CNY`} />
              {result.isMarginAlert && (
                <Badge variant="destructive" className="mt-2">
                  마진 위험 (2% 미만)
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {winnerAnalysis ? (
        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">아이템 위너 가능성 (안정적 전략 기준)</CardTitle>
            <CardDescription>10g당 단가 비교</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between pt-3 text-sm">
            <span>우리 단가: {winnerAnalysis.myPricePer10g.toFixed(1)}원</span>
            <span>경쟁사 단가: {winnerAnalysis.competitorPricePer10g.toFixed(1)}원</span>
            <Badge variant={canWin ? "default" : "destructive"}>
              {canWin ? "위너 확보 가능" : "가격 열위"}
            </Badge>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

interface ChannelMarginTableProps extends Omit<MarginCalcInput, "targetMargin" | "channel"> {}

export function ChannelMarginTable(props: ChannelMarginTableProps) {
  const channels = Object.keys(CHANNEL_RATES) as ChannelKey[];
  const rows = channels.map((channel) => {
    const result = calcMargin({ ...props, channel, targetMargin: 0.15 });
    return { channel, ...CHANNEL_RATES[channel], ...result };
  });

  return (
    <Card size="sm">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">채널별 마진 비교</CardTitle>
        <CardDescription>목표 마진 15% 기준 권장 판매가/실마진 비교</CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="p-2 text-left">채널</th>
              <th className="p-2 text-right">수수료율</th>
              <th className="p-2 text-right">권장가(VAT)</th>
              <th className="p-2 text-right">개당 순익</th>
              <th className="p-2 text-right">실마진</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.channel} className="border-b">
                <td className="p-2">{row.name}</td>
                <td className="p-2 text-right">{row.fee}%</td>
                <td className="p-2 text-right">
                  {Math.round(row.suggestedPriceVAT).toLocaleString()}원
                </td>
                <td className="p-2 text-right">
                  {Math.round(row.profitPerUnit).toLocaleString()}원
                </td>
                <td className={`p-2 text-right ${row.isMarginAlert ? "text-red-500" : ""}`}>
                  {(row.actualMargin * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
