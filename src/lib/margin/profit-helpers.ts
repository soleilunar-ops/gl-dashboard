import type { ProfitResult } from "./types";

export const roundCurrency = (value: number) => Math.round(value);

/**
 * VAT 포함 판매가가 주어졌을 때 정산·순익·마진율 역산 (채널 정산비율 반영)
 */
export function calcProfitWithVatPrice(
  totalUnitCost: number,
  vatIncludedPrice: number,
  qty: number,
  settlementRatio: number
): ProfitResult {
  const netPrice = vatIncludedPrice / 1.1;
  const settlementPerUnit = netPrice * settlementRatio;
  const profitPerUnit = settlementPerUnit - totalUnitCost;
  const marginRate = settlementPerUnit > 0 ? profitPerUnit / settlementPerUnit : 0;
  return {
    settlementPerUnit,
    profitPerUnit,
    marginRate,
    totalProfit: profitPerUnit * qty,
  };
}

/** VAT 포함 단가 기준 g당 단가 → 10g당 원가 환산 (경쟁사 비교용) */
export function calcPricePer10g(vatIncludedPrice: number, weightGram: number): number {
  if (weightGram <= 0) {
    return 0;
  }
  return vatIncludedPrice / (weightGram / 10);
}
