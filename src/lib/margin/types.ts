import type { ChannelKey } from "./constants";

/** calcMargin 입력 — 계약 통화가 USD인 경우에도 동일 공식이며, exPI/exCurrent만 USD/KRW로 맞추면 됨 */
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
  /** true면 센터 OVER 구간 밀크런 단가 사용 */
  isOver?: boolean;
  /** 예약: 반품률 등으로 센터 순이익 가중 시 사용 (미구현, 회의록 확장용) */
  returnRate?: number;
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
