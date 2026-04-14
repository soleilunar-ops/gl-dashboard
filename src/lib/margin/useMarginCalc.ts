export const CENTER_RATES: Record<string, { basic: number; over: number }> = {
  "이천1(36)": { basic: 44700, over: 59700 },
  "이천2(05)": { basic: 44700, over: 59700 },
  "이천3(43)": { basic: 45900, over: 60900 },
  "이천4(13)": { basic: 45900, over: 60900 },
  이천5: { basic: 44700, over: 59700 },
  "안성4(14)": { basic: 46100, over: 61100 },
  "안성5(03)": { basic: 44700, over: 59700 },
  "안성8(10)": { basic: 46100, over: 61100 },
  안성9: { basic: 44700, over: 59700 },
  "부천1(04)": { basic: 33300, over: 48300 },
  "천안(23)": { basic: 46100, over: 61100 },
  "동탄1(17)": { basic: 42600, over: 57600 },
  동탄2: { basic: 42600, over: 57600 },
  "인천4(38)": { basic: 33300, over: 48300 },
  "인천5(32)": { basic: 35000, over: 50000 },
  "호법(16)": { basic: 44700, over: 59700 },
  "곤지암2(91)": { basic: 43500, over: 58500 },
  "고양1(27)": { basic: 31200, over: 46200 },
  "평택1(24)": { basic: 35000, over: 50000 },
  "마장1(12)": { basic: 44700, over: 59700 },
};

export const CHANNEL_RATES = {
  coupang_rocket: { settlementRatio: 0.56, name: "쿠팡 로켓배송", fee: 44 },
  coupang_seller: { settlementRatio: 0.85, name: "쿠팡 판매자로켓", fee: 15 },
  naver: { settlementRatio: 0.965, name: "네이버 스마트스토어", fee: 3.5 },
  gmarket: { settlementRatio: 0.89, name: "지마켓", fee: 11 },
  ssg: { settlementRatio: 0.88, name: "SSG닷컴", fee: 12 },
  kakao: { settlementRatio: 0.93, name: "카카오선물하기", fee: 7 },
} as const;

export type ChannelKey = keyof typeof CHANNEL_RATES;

export interface MarginCalcInput {
  cnyCostPerUnit: number;
  exPI: number;
  exCurrent: number;
  qShip: number;
  qTotal: number;
  palletReworkCost: number;
  centerName: string;
  pcsPerPallet: number;
  targetMargin: number;
  channel: ChannelKey;
  isOver?: boolean;
}

export interface MarginCalcResult {
  exFinal: number;
  costKRW: number;
  logisticsPerUnit: number;
  totalCostPerUnit: number;
  suggestedPriceNet: number;
  suggestedPriceVAT: number;
  actualMargin: number;
  isMarginAlert: boolean;
  settlementAmount: number;
  profitPerUnit: number;
}

export interface ProfitResult {
  settlementPerUnit: number;
  profitPerUnit: number;
  marginRate: number;
  totalProfit: number;
}

export const roundCurrency = (value: number) => Math.round(value);

export function calcMargin(input: MarginCalcInput): MarginCalcResult {
  const shipRatio = input.qTotal > 0 ? input.qShip / input.qTotal : 1;
  const exFinal = input.exPI * 0.3 + input.exCurrent * 0.7 * shipRatio;
  const costKRW = input.cnyCostPerUnit * exFinal;

  const centerRate = CENTER_RATES[input.centerName];
  const milkRunRate = centerRate ? (input.isOver ? centerRate.over : centerRate.basic) : 44700;
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

export function calcPricePer10g(vatIncludedPrice: number, weightGram: number) {
  if (weightGram <= 0) {
    return 0;
  }
  return vatIncludedPrice / (weightGram / 10);
}
