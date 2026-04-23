"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { calcMargin, type MarginInput, type MarginResult } from "./_hooks/useMarginCalc";

type StrategyLabel = "보수" | "안정" | "공격";

type Props = {
  /** targetMargin은 하위에서 선택 전략 목표율로 덮어쓰므로 MarginInput 그대로 수용 */
  base: MarginInput;
  targets: [number, number, number];
  onTargetChange: (index: 0 | 1 | 2, value: number) => void;
};

/** 권장가 제안 단일 카드 — 변경 이유: 게이지 값에 따라 전략명을 보수/안정/공격으로 자동 분류 */
export default function StrategyCards({ base, targets, onTargetChange }: Props) {
  const selectedTarget = targets[2];
  const result: MarginResult = useMemo(
    () => calcMargin({ ...base, targetMargin: selectedTarget }),
    [base, selectedTarget]
  );

  const strategyLabel: StrategyLabel = useMemo(() => {
    if (selectedTarget >= 0.15) return "보수";
    if (selectedTarget >= 0.1) return "안정";
    return "공격";
  }, [selectedTarget]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold tracking-tight">권장가 제안</CardTitle>
      </CardHeader>
      <CardContent>
        <StrategyCard
          label={strategyLabel}
          target={selectedTarget}
          onChange={(v) => onTargetChange(2, v)}
          result={result}
        />
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

  const handleSliderInput = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(30, n));
    onChange(clamped / 100);
  };

  return (
    <Card className={cn("border-0 shadow-none", alert && "border border-red-500 shadow-sm")}>
      <CardHeader className="pb-3">
        <CardTitle className="text-center text-lg font-semibold tracking-tight">
          {label} 전략
        </CardTitle>
        {alert && (
          <div className="mt-1 flex justify-center">
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              마진 위험
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {/* 고급 슬라이더 — 따뜻한 골드 그라디언트 포인트 컬러(#F2BE5C / #E3A83E) */}
            <SliderPrimitive.Root
              min={0}
              max={30}
              step={1}
              value={[percent]}
              onValueChange={(v) => handleSliderInput(String(v[0] ?? 0))}
              className="relative flex flex-1 touch-none items-center select-none"
              aria-label="목표 마진율"
            >
              <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-gradient-to-r from-[#FDF3D0] via-[#FAE8B8] to-[#F5D88A]/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-[#F5D88A] via-[#F2BE5C] to-[#E3A83E] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                className={cn(
                  "block h-5 w-5 rounded-full border-2 border-[#E3A83E] bg-white",
                  "shadow-[0_2px_6px_rgba(227,168,62,0.4),0_0_0_1px_rgba(227,168,62,0.12)]",
                  "transition-transform hover:scale-110 focus-visible:scale-110",
                  "focus-visible:ring-4 focus-visible:ring-[#F2BE5C]/30 focus-visible:outline-none"
                )}
              />
            </SliderPrimitive.Root>
            <Input
              type="number"
              min={0}
              max={30}
              step={1}
              value={percent}
              onChange={(e) => handleSliderInput(e.target.value)}
              className="w-16 tabular-nums"
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
