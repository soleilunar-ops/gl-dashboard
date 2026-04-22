"use client";

import { useMemo } from "react";

/** 광고비 입력 방식 — 원/개 또는 매출 대비 비율 */
export type AdFeeMode = "amount" | "rate";

/** 마진 계산 입력 — 변경 이유: GL-RADS 마진 계산기 단일 진실 공급원 */
export type MarginInput = {
  cnyUnitPrice: number;
  unitWeightG?: number;
  exPI: number;
  exCurrent: number;
  qShip: number;
  qTotal: number;
  palletReworkFee: number;
  milkRunFeePerPallet: number;
  unitsPerPallet: number;
  shippingFeePerUnit?: number;
  adFeeMode?: AdFeeMode;
  adFeeValue?: number;
  channelPayoutRate: number;
  targetMargin: number;
  competitorPrice?: number;
};

/** 원가 분해 — UI 표시용 */
export type MarginCostBreakdown = {
  material: number;
  logistics: number;
  shipping: number;
  ad: number;
};

/** 계산 결과 — 변경 이유: 카드·차트·테이블 공통 출력 스키마 */
export type MarginCalcResult = {
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
  effectivePayoutRate: number;
  pricePer10g?: number;
  competitorPricePer10g?: number;
  isWinner?: boolean;
};

/** 숫자 안전화 — NaN/무한 방지 */
function safeNum(n: number, fallback = 0): number {
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/** 적용 환율(exFinal) — PI·선적비중 가중 — 변경 이유: 업무 정의식 그대로 반영 */
function computeExFinal(input: MarginInput): number {
  const exPI = safeNum(input.exPI);
  const exCurrent = safeNum(input.exCurrent);
  const qShip = safeNum(input.qShip);
  const qTotal = safeNum(input.qTotal);
  const ratio = qTotal > 0 ? qShip / qTotal : 0;
  return exPI * 0.3 + exCurrent * 0.7 * ratio;
}

/**
 * 순수 마진 계산 — 로직은 이 함수에만 존재 (외부 중복 금지)
 * 변경 이유: 요구된 계산 순서·분기·경쟁사 비교 일원화
 */
export function calcMargin(raw: MarginInput): MarginCalcResult {
  const cnyUnitPrice = safeNum(raw.cnyUnitPrice);
  const shippingFeePerUnit = safeNum(raw.shippingFeePerUnit ?? 0);
  const palletReworkFee = safeNum(raw.palletReworkFee);
  const milkRunFeePerPallet = safeNum(raw.milkRunFeePerPallet);
  const unitsPerPallet = safeNum(raw.unitsPerPallet);
  const channelPayoutRate = safeNum(raw.channelPayoutRate);
  const targetMargin = safeNum(raw.targetMargin);
  const adFeeMode: AdFeeMode = raw.adFeeMode ?? "amount";
  const adFeeValue = raw.adFeeValue !== undefined ? safeNum(raw.adFeeValue) : 0;

  const exFinal = computeExFinal(raw);

  /** 정산비율에서 광고율 차감 vs 원가 가산 — 변경 이유: 요구 분기 */
  let effectivePayoutRate = channelPayoutRate;
  let adAmount = 0;
  if (adFeeMode === "rate") {
    let adRate = adFeeValue;
    if (adRate > 1) adRate = adRate / 100;
    adRate = Math.min(Math.max(adRate, 0), 1);
    effectivePayoutRate = channelPayoutRate - adRate;
  } else {
    adAmount = Math.max(0, adFeeValue);
  }

  const logisticsPerUnit =
    unitsPerPallet > 0
      ? (palletReworkFee + milkRunFeePerPallet) / unitsPerPallet
      : Number.POSITIVE_INFINITY;

  const material = cnyUnitPrice * exFinal;
  const logistics = Number.isFinite(logisticsPerUnit) ? logisticsPerUnit : Number.POSITIVE_INFINITY;
  const shipping = shippingFeePerUnit;
  const ad = adAmount;

  const costBreakdown: MarginCostBreakdown = {
    material,
    logistics: Number.isFinite(logistics) ? logistics : 0,
    shipping,
    ad,
  };

  const costTotal =
    material +
    (Number.isFinite(logisticsPerUnit) ? logisticsPerUnit : Number.POSITIVE_INFINITY) +
    shipping +
    ad;

  const infeasibleReason =
    unitsPerPallet <= 0 ||
    !Number.isFinite(costTotal) ||
    effectivePayoutRate <= targetMargin ||
    effectivePayoutRate <= 0;

  if (infeasibleReason) {
    return {
      exFinal,
      costTotal: Number.isFinite(costTotal) ? costTotal : 0,
      costBreakdown: {
        material,
        logistics: Number.isFinite(logisticsPerUnit) ? logisticsPerUnit : 0,
        shipping,
        ad,
      },
      recommendedPriceVAT: 0,
      netPrice: 0,
      payoutAmount: 0,
      unitProfit: 0,
      actualMargin: 0,
      isMarginAlert: false,
      isInfeasible: true,
      effectivePayoutRate,
    };
  }

  const denom = effectivePayoutRate - targetMargin;
  if (denom <= 0) {
    return {
      exFinal,
      costTotal,
      costBreakdown,
      recommendedPriceVAT: 0,
      netPrice: 0,
      payoutAmount: 0,
      unitProfit: 0,
      actualMargin: 0,
      isMarginAlert: false,
      isInfeasible: true,
      effectivePayoutRate,
    };
  }

  const netPrice = costTotal / denom;
  const recommendedPriceVAT = netPrice * 1.1;
  const payoutAmount = netPrice * effectivePayoutRate;
  const unitProfit = payoutAmount - costTotal;
  const actualMargin = netPrice > 0 ? unitProfit / netPrice : 0;
  const isMarginAlert = actualMargin < 0.02;

  const unitWeightG = raw.unitWeightG !== undefined ? safeNum(raw.unitWeightG) : 0;
  let pricePer10g: number | undefined;
  let competitorPricePer10g: number | undefined;
  let isWinner: boolean | undefined;

  if (unitWeightG > 0) {
    pricePer10g = (recommendedPriceVAT / unitWeightG) * 10;
  }
  if (raw.competitorPrice !== undefined && Number.isFinite(raw.competitorPrice)) {
    competitorPricePer10g = safeNum(raw.competitorPrice);
  }
  if (
    pricePer10g !== undefined &&
    competitorPricePer10g !== undefined &&
    Number.isFinite(pricePer10g) &&
    Number.isFinite(competitorPricePer10g)
  ) {
    isWinner = pricePer10g <= competitorPricePer10g;
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
    effectivePayoutRate,
    pricePer10g,
    competitorPricePer10g,
    isWinner,
  };
}

/** 입력 스냅샷 메모이제이션 — 변경 이유: 불필요한 재계산 방지 */
export function useMarginCalc(input: MarginInput): MarginCalcResult {
  return useMemo(
    () => calcMargin(input),
    [
      input.cnyUnitPrice,
      input.unitWeightG,
      input.exPI,
      input.exCurrent,
      input.qShip,
      input.qTotal,
      input.palletReworkFee,
      input.milkRunFeePerPallet,
      input.unitsPerPallet,
      input.shippingFeePerUnit,
      input.adFeeMode,
      input.adFeeValue,
      input.channelPayoutRate,
      input.targetMargin,
      input.competitorPrice,
    ]
  );
}
