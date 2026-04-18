import { CHANNEL_RATES, CENTER_RATES, DEFAULT_MILKRUN_BASIC_WHEN_UNKNOWN } from "./constants";
import type { MarginCalcInput, MarginCalcResult } from "./types";

/**
 * 분할 정산 환율 ExFinal
 * ExFinal = (ExPI × 0.3) + (ExCurrent × 0.7 × QShip / QTotal)
 * QTotal=0이면 선적 비중을 알 수 없어 QShip/QTotal 대신 1로 간주
 */
export function calcFinalExchangeRate(
  exPI: number,
  exCurrent: number,
  qShip: number,
  qTotal: number
): number {
  const shipRatio = qTotal > 0 ? qShip / qTotal : 1;
  return exPI * 0.3 + exCurrent * 0.7 * shipRatio;
}

/** 센터명에 대응하는 밀크런 단가(원/파레트); 미등록 센터는 basic 폴백만 사용(기존 동작 유지) */
export function resolveMilkRunPerPallet(centerName: string, isOver: boolean): number {
  const row = CENTER_RATES[centerName];
  if (!row) {
    return DEFAULT_MILKRUN_BASIC_WHEN_UNKNOWN;
  }
  return isOver ? row.over : row.basic;
}

/**
 * 마진·권장가 단일 엔진
 * - 개당 총 원가 = (CNY × ExFinal) + (파레트재작업비 + 밀크런) / 파레트당적재수
 * - 권장 판매가(VAT포함) = [CostTotal / (정산비율 - 목표마진)] × 1.1
 */
export function calcMargin(input: MarginCalcInput): MarginCalcResult {
  const exFinal = calcFinalExchangeRate(input.exPI, input.exCurrent, input.qShip, input.qTotal);
  const costKRW = input.cnyCostPerUnit * exFinal;

  const milkRunRate = resolveMilkRunPerPallet(input.centerName, input.isOver ?? false);
  const logisticsPerUnit =
    input.pcsPerPallet > 0 ? (input.palletReworkCost + milkRunRate) / input.pcsPerPallet : 0;
  const totalCostPerUnit = costKRW + logisticsPerUnit;

  const settlementRatio = CHANNEL_RATES[input.channel].settlementRatio;
  const denominator = settlementRatio - input.targetMargin;
  const suggestedPriceNet = denominator > 0 ? totalCostPerUnit / denominator : 0;
  const suggestedPriceVAT = suggestedPriceNet * 1.1;

  const settlementAmount = suggestedPriceNet * settlementRatio;
  const profitPerUnit = settlementAmount - totalCostPerUnit;
  const actualMargin = settlementAmount > 0 ? profitPerUnit / settlementAmount : 0;

  return {
    exFinal,
    costKRW,
    logisticsPerUnit,
    totalCostPerUnit,
    suggestedPriceNet,
    suggestedPriceVAT,
    actualMargin,
    isMarginAlert: actualMargin < 0.02,
    settlementAmount,
    profitPerUnit,
  };
}
