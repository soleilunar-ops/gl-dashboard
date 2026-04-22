"use client";

import { useMemo } from "react";

/** 마진 계산 입력 — 변경 이유: analytics/cost 전용 단순화 스키마 */
export type MarginInput = {
  cnyUnitPrice: number;
  exPI: number;
  exCurrent: number;
  qShip: number;
  qTotal: number;
  palletReworkFee: number;
  unitsPerPallet: number;
  otherCostPerUnit?: number;
  channelPayoutRate: number;
  targetMargin: number;
  referencePriceVAT?: number;
};

/** 원가 분해 — UI 표시용 */
export type MarginCostBreakdown = {
  material: number;
  logistics: number;
  other: number;
};

/** 계산 결과 — 변경 이유: 현재가 진단 + 권장가 제안 공통 출력 */
export type MarginResult = {
  exFinal: number;
  costTotal: number;
  costBreakdown: MarginCostBreakdown;
  recommendedPriceVAT: number;
  netPrice: number;
  payoutAmount: number;
  unitProfit: number;
  actualMargin: number;
  isMarginAlert: boolean;
  isInfeasible: boolean;

  currentNetPrice?: number;
  currentPayout?: number;
  currentProfit?: number;
  currentMargin?: number;
  priceGapToTarget?: number;
};

/** 숫자 안전화 — NaN/Infinity 방어 */
function safeNum(n: number | undefined, fallback = 0): number {
  if (n === undefined || n === null) return fallback;
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/** infeasible 기본 결과 — exFinal과 breakdown만 채운 상태 */
function emptyInfeasible(exFinal: number, breakdown: MarginCostBreakdown): MarginResult {
  const costTotal = breakdown.material + breakdown.logistics + breakdown.other;
  return {
    exFinal,
    costTotal: Number.isFinite(costTotal) ? costTotal : 0,
    costBreakdown: breakdown,
    recommendedPriceVAT: 0,
    netPrice: 0,
    payoutAmount: 0,
    unitProfit: 0,
    actualMargin: 0,
    isMarginAlert: false,
    isInfeasible: true,
  };
}

/**
 * 순수 마진 계산 — 로직은 이 함수에만 존재 (analytics/cost 단일 진실 공급원)
 * 변경 이유: 사용자 스펙 단순 공식(PI 30% + Current 70% × qShip/qTotal)
 */
export function calcMargin(raw: MarginInput): MarginResult {
  const cnyUnitPrice = safeNum(raw.cnyUnitPrice);
  const exPI = safeNum(raw.exPI);
  const exCurrent = safeNum(raw.exCurrent);
  const qTotalRaw = safeNum(raw.qTotal);
  const palletReworkFee = safeNum(raw.palletReworkFee);
  const unitsPerPallet = safeNum(raw.unitsPerPallet);
  const otherCostPerUnit = safeNum(raw.otherCostPerUnit ?? 0);
  const r = safeNum(raw.channelPayoutRate);
  const targetMargin = safeNum(raw.targetMargin);

  const qTotal = qTotalRaw > 0 ? qTotalRaw : 0;
  const qShip = Math.max(0, Math.min(safeNum(raw.qShip), qTotal));

  const ratio = qTotal > 0 ? qShip / qTotal : 0;
  const exFinal = exPI * 0.3 + exCurrent * 0.7 * ratio;

  const material = cnyUnitPrice * exFinal;
  const logistics =
    unitsPerPallet > 0 ? palletReworkFee / unitsPerPallet : Number.POSITIVE_INFINITY;
  const other = otherCostPerUnit;

  const costBreakdown: MarginCostBreakdown = {
    material,
    logistics: Number.isFinite(logistics) ? logistics : 0,
    other,
  };

  if (qTotal <= 0 || unitsPerPallet <= 0 || !Number.isFinite(logistics)) {
    return emptyInfeasible(exFinal, costBreakdown);
  }

  const costTotal = material + logistics + other;

  if (r <= targetMargin || r <= 0) {
    const base = emptyInfeasible(exFinal, costBreakdown);
    return { ...base, costTotal };
  }

  const netPrice = costTotal / (r - targetMargin);
  const recommendedPriceVAT = netPrice * 1.1;
  const payoutAmount = netPrice * r;
  const unitProfit = payoutAmount - costTotal;
  const actualMargin = netPrice > 0 ? unitProfit / netPrice : 0;
  const isMarginAlert = actualMargin < 0.02;

  let currentNetPrice: number | undefined;
  let currentPayout: number | undefined;
  let currentProfit: number | undefined;
  let currentMargin: number | undefined;
  let priceGapToTarget: number | undefined;

  const refVAT = raw.referencePriceVAT;
  if (refVAT !== undefined && Number.isFinite(refVAT) && refVAT > 0) {
    currentNetPrice = refVAT / 1.1;
    currentPayout = currentNetPrice * r;
    currentProfit = currentPayout - costTotal;
    currentMargin = currentNetPrice > 0 ? currentProfit / currentNetPrice : 0;
    priceGapToTarget = Math.max(0, recommendedPriceVAT - refVAT);
  }

  return {
    exFinal,
    costTotal,
    costBreakdown,
    recommendedPriceVAT,
    netPrice,
    payoutAmount,
    unitProfit,
    actualMargin,
    isMarginAlert,
    isInfeasible: false,
    currentNetPrice,
    currentPayout,
    currentProfit,
    currentMargin,
    priceGapToTarget,
  };
}

/** 입력 스냅샷 메모이제이션 — 변경 이유: 불필요한 재계산 방지 */
export function useMarginCalc(input: MarginInput): MarginResult {
  return useMemo(
    () => calcMargin(input),
    [
      input.cnyUnitPrice,
      input.exPI,
      input.exCurrent,
      input.qShip,
      input.qTotal,
      input.palletReworkFee,
      input.unitsPerPallet,
      input.otherCostPerUnit,
      input.channelPayoutRate,
      input.targetMargin,
      input.referencePriceVAT,
    ]
  );
}
