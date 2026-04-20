"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { calcMargin, type MarginInput, type MarginResult } from "./_hooks/useMarginCalc";

type StrategyLabel = "보수" | "안정" | "공격";

type StrategyDef = {
  label: StrategyLabel;
  defaultRate: number;
};

const STRATEGIES: StrategyDef[] = [
  { label: "보수", defaultRate: 0.2 },
  { label: "안정", defaultRate: 0.15 },
  { label: "공격", defaultRate: 0.05 },
];

type Props = {
  /** targetMargin은 하위에서 각 전략 목표율로 덮어쓰므로 MarginInput 그대로 수용 */
  base: MarginInput;
  targets: [number, number, number];
  onTargetChange: (index: 0 | 1 | 2, value: number) => void;
};

/** 권장가 제안 3카드 — 변경 이유: 보수/안정/공격 전략별 동시 비교 */
export default function StrategyCards({ base, targets, onTargetChange }: Props) {
  const results: MarginResult[] = useMemo(
    () => targets.map((t) => calcMargin({ ...base, targetMargin: t })),
    [base, targets]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">권장가 제안</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STRATEGIES.map((s, idx) => (
            <StrategyCard
              key={s.label}
              label={s.label}
              target={targets[idx]}
              onChange={(v) => onTargetChange(idx as 0 | 1 | 2, v)}
              result={results[idx]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type CardProps = {
  label: StrategyLabel;
  target: number;
  onChange: (value: number) => void;
  result: MarginResult;
};

function StrategyCard({ label, target, onChange, result }: CardProps) {
  const percent = Math.round(target * 1000) / 10;
  const alert = result.isMarginAlert;
  const infeasible = result.isInfeasible;
  const borderClass = alert ? "border-red-500" : "";

  const handleSliderInput = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(30, n));
    onChange(clamped / 100);
  };

  return (
    <Card className={borderClass}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{label} 전략</CardTitle>
          {alert && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              마진 위험
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={percent}
              onChange={(e) => handleSliderInput(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              max={30}
              step={1}
              value={percent}
              onChange={(e) => handleSliderInput(e.target.value)}
              className="w-16"
            />
            <span className="text-muted-foreground text-xs">%</span>
          </div>
        </div>

        {infeasible ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            달성 불가
            <br />
            <span className="text-xs">(수수료 ≤ 목표 마진)</span>
          </p>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground text-xs">권장가 (VAT 포함)</p>
              <p className="text-xl font-bold">
                {Math.round(result.recommendedPriceVAT).toLocaleString("ko-KR")}원
              </p>
            </div>
            <dl className="space-y-1 text-xs">
              <Row
                label="개당 원가"
                value={`${Math.round(result.costBreakdown.material).toLocaleString("ko-KR")}원`}
              />
              <Row
                label="물류비"
                value={`${Math.round(result.costBreakdown.logistics).toLocaleString("ko-KR")}원`}
              />
              <Row
                label="실질 정산액"
                value={`${Math.round(result.payoutAmount).toLocaleString("ko-KR")}원`}
              />
              <Row
                label="개당 순익"
                value={`${Math.round(result.unitProfit).toLocaleString("ko-KR")}원`}
              />
              <Row label="적용 ExFinal" value={result.exFinal.toFixed(1)} />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
