"use client";

// 마진 계산 — 단순화된 공식 (지호 v0.5)
// 입력: 단가(CNY), 환율, 원가(KRW/개), 판매가(VAT), 채널 정산율, 목표 마진율, 파레트재작업비, 기타비용
// 출력: 현재가 기준 실제 마진 + 목표 달성 여부 + 자연어 진단
import { useMemo } from "react";

export type MarginInput = {
  cnyUnitPrice: number; // 단가 (CNY, 참조)
  exchangeRate: number; // 환율 (KRW/CNY, 참조)
  unitCost: number; // 원가 (KRW per unit)
  sellingPriceVAT: number; // 판매가 (VAT 포함)
  channelPayoutRate: number; // 판매 채널 정산율 (0~1)
  targetMargin: number; // 목표 마진율 (0~1)
  palletReworkFee: number; // 파레트 재작업비 (KRW per unit)
  otherCostPerUnit: number; // 기타비용 (광고·포장 포함, KRW per unit)
};

export type MarginResult = {
  totalCostPerUnit: number;
  netPrice: number;
  payoutAmount: number;
  unitProfit: number;
  currentMargin: number; // 판매가 기준 실제 마진율
  isTargetMet: boolean;
  gapToTarget: number; // 목표 대비 부족/초과 (percentage point)
  diagnosis: MarginDiagnosis;
  isInfeasible: boolean;

  // 채널별 테이블용 — 목표 마진율을 달성하기 위한 권장 판매가 및 그 시점의 지표
  recommendedPriceVAT: number;
  recommendedUnitProfit: number;
  recommendedMargin: number;
  isMarginAlert: boolean; // 목표 마진율 < 2% 거나 달성 불가
};

export type MarginDiagnosis = {
  level: "critical" | "warning" | "good" | "excellent";
  headline: string;
  detail: string;
};

function safe(n: number | undefined, fb = 0): number {
  if (n === undefined || n === null) return fb;
  return Number.isFinite(n) ? n : fb;
}

function buildDiagnosis(
  margin: number,
  target: number,
  isTargetMet: boolean,
  isLoss: boolean
): MarginDiagnosis {
  if (isLoss) {
    return {
      level: "critical",
      headline: "손실 상태",
      detail: "판매가가 원가를 못 미쳐 개당 손실이 발생합니다. 판매가 인상 또는 원가 절감 필요.",
    };
  }
  const gap = margin - target;
  if (gap >= 0.05) {
    return {
      level: "excellent",
      headline: "목표 대비 여유",
      detail: `목표보다 ${Math.round(gap * 100)}%p 높습니다. 경쟁사 프로모션 대응용 여유 확보.`,
    };
  }
  if (isTargetMet) {
    return {
      level: "good",
      headline: "목표 마진 달성",
      detail: "현재가 기준 목표 마진율을 충족합니다. 유지 권장.",
    };
  }
  if (gap >= -0.02) {
    return {
      level: "warning",
      headline: "목표 근접 · 주의",
      detail: `목표보다 ${Math.round(Math.abs(gap) * 100)}%p 낮습니다. 광고·포장비 최적화 또는 소폭 인상 검토.`,
    };
  }
  return {
    level: "critical",
    headline: "목표 미달",
    detail: `목표보다 ${Math.round(Math.abs(gap) * 100)}%p 부족합니다. 채널 변경·가격 인상 또는 원가 재협상 필요.`,
  };
}

export function calcMargin(raw: MarginInput): MarginResult {
  const unitCost = safe(raw.unitCost);
  const palletReworkFee = safe(raw.palletReworkFee);
  const otherCost = safe(raw.otherCostPerUnit);
  const sellingVAT = safe(raw.sellingPriceVAT);
  const r = safe(raw.channelPayoutRate);
  const target = safe(raw.targetMargin);

  const totalCostPerUnit = unitCost + palletReworkFee + otherCost;
  const netPrice = sellingVAT > 0 ? sellingVAT / 1.1 : 0;
  const payoutAmount = netPrice * r;
  const unitProfit = payoutAmount - totalCostPerUnit;
  const currentMargin = netPrice > 0 ? unitProfit / netPrice : 0;
  const isInfeasible = sellingVAT <= 0 || r <= 0;
  const isTargetMet = !isInfeasible && currentMargin >= target;
  const gapToTarget = currentMargin - target;
  const diagnosis = buildDiagnosis(currentMargin, target, isTargetMet, unitProfit < 0);

  // 권장가: 목표 마진율 달성에 필요한 netPrice = cost / (r - target)
  let recommendedPriceVAT = 0;
  let recommendedUnitProfit = 0;
  let recommendedMargin = 0;
  const feasibleForTarget = r > 0 && r > target && totalCostPerUnit > 0;
  if (feasibleForTarget) {
    const recNet = totalCostPerUnit / (r - target);
    recommendedPriceVAT = recNet * 1.1;
    recommendedUnitProfit = recNet * r - totalCostPerUnit;
    recommendedMargin = recNet > 0 ? recommendedUnitProfit / recNet : 0;
  }
  const isMarginAlert = !feasibleForTarget || target < 0.02;

  return {
    totalCostPerUnit,
    netPrice,
    payoutAmount,
    unitProfit,
    currentMargin,
    isTargetMet,
    gapToTarget,
    diagnosis,
    isInfeasible,
    recommendedPriceVAT,
    recommendedUnitProfit,
    recommendedMargin,
    isMarginAlert,
  };
}

export function useMarginCalc(input: MarginInput): MarginResult {
  return useMemo(
    () => calcMargin(input),
    [
      input.cnyUnitPrice,
      input.exchangeRate,
      input.unitCost,
      input.sellingPriceVAT,
      input.channelPayoutRate,
      input.targetMargin,
      input.palletReworkFee,
      input.otherCostPerUnit,
    ]
  );
}
