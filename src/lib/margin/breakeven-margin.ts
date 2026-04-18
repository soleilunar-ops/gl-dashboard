import { CHANNEL_RATES } from "./constants";
import { calcMargin } from "./calc-margin";
import { calcProfitWithVatPrice } from "./profit-helpers";
import type { MarginCalcInput } from "./types";

/** 이분 탐색 최대 반복 (double 기준 약 2^-64 구간) */
const BISECT_MAX_ITER = 64;
/** 마진율 절대 허용 오차 (0.0001 = 0.01%p) */
const MARGIN_RATE_TOL = 1e-4;
/** 환율 BEP 탐색 구간 (CNY/KRW) — 차트(170~230)와 별도; 하한을 낮춰 ‘더 약한(낮은) 환율 쪽 BEP’도 탐색 */
const EX_LO = 12;
const EX_HI = 1200;

function marginRateAtExchange(
  inputBase: Omit<MarginCalcInput, "exCurrent">,
  exCurrent: number,
  vatPrice: number
): number {
  const settlementRatio = CHANNEL_RATES[inputBase.channel].settlementRatio;
  if (settlementRatio <= 0 || vatPrice <= 0) return Number.NaN;
  const totalCost = calcMargin({ ...inputBase, exCurrent }).totalCostPerUnit;
  if (!Number.isFinite(totalCost) || totalCost < 0) return Number.NaN;
  return calcProfitWithVatPrice(totalCost, vatPrice, 1, settlementRatio).marginRate;
}

function marginRateAtShipQty(
  inputBase: Omit<MarginCalcInput, "qShip">,
  qShip: number,
  vatPrice: number
): number {
  const settlementRatio = CHANNEL_RATES[inputBase.channel].settlementRatio;
  if (settlementRatio <= 0 || vatPrice <= 0) return Number.NaN;
  const totalCost = calcMargin({ ...inputBase, qShip }).totalCostPerUnit;
  if (!Number.isFinite(totalCost) || totalCost < 0) return Number.NaN;
  return calcProfitWithVatPrice(totalCost, vatPrice, 1, settlementRatio).marginRate;
}

/**
 * 목표 마진율(기본 2%)에 도달하는 현재환율(exCurrent) 역산.
 * 전제: 일반 계약에서 exCurrent↑ → 개당원가↑ → 마진율↓ (단조 감소).
 * @returns 구간 내 역산 불가·구조적 적자·비단조 시 null
 */
export function calcBreakevenRate(
  inputBase: Omit<MarginCalcInput, "exCurrent">,
  vatPrice: number,
  minMargin = 0.02
): number | null {
  if (vatPrice <= 0) return null;
  const sr = CHANNEL_RATES[inputBase.channel].settlementRatio;
  if (sr <= 0) return null;
  if (inputBase.targetMargin >= sr) return null;

  const mLo = marginRateAtExchange(inputBase, EX_LO, vatPrice);
  const mHi = marginRateAtExchange(inputBase, EX_HI, vatPrice);
  if (!Number.isFinite(mLo) || !Number.isFinite(mHi)) return null;
  if (mLo - mHi <= 1e-12) return null;
  if (mLo < minMargin) return null;
  if (mHi > minMargin) return null;

  let lo = EX_LO;
  let hi = EX_HI;
  for (let i = 0; i < BISECT_MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const mMid = marginRateAtExchange(inputBase, mid, vatPrice);
    if (!Number.isFinite(mMid)) return null;
    if (Math.abs(mMid - minMargin) <= MARGIN_RATE_TOL || hi - lo <= 0.02) {
      return mid;
    }
    if (mMid >= minMargin) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 목표 마진율에 도달하는 선적 수량(qShip) 역산 (qTotal 대비 비중이 ExFinal에 반영됨).
 * 전제: 일반적으로 qShip↑ → ExFinal이 현재환율 쪽으로 기울며 마진이 감소하는 경우가 많음(단조는 입력에 의존).
 */
export function calcBreakevenQty(
  inputBase: Omit<MarginCalcInput, "qShip">,
  vatPrice: number,
  minMargin = 0.02
): number | null {
  if (vatPrice <= 0) return null;
  const sr = CHANNEL_RATES[inputBase.channel].settlementRatio;
  if (sr <= 0) return null;
  if (inputBase.targetMargin >= sr) return null;

  const qTotal = inputBase.qTotal > 0 ? inputBase.qTotal : 1;
  const lo = 1;
  const hi = Math.max(lo, qTotal);
  const mLo = marginRateAtShipQty(inputBase, lo, vatPrice);
  const mHi = marginRateAtShipQty(inputBase, hi, vatPrice);
  if (!Number.isFinite(mLo) || !Number.isFinite(mHi)) return null;
  if (mLo - mHi <= 1e-12) return null;
  if (mLo < minMargin) return null;
  if (mHi > minMargin) return null;

  let a = lo;
  let b = hi;
  for (let i = 0; i < BISECT_MAX_ITER; i++) {
    const mid = (a + b) / 2;
    const mMid = marginRateAtShipQty(inputBase, mid, vatPrice);
    if (!Number.isFinite(mMid)) return null;
    if (Math.abs(mMid - minMargin) <= MARGIN_RATE_TOL || b - a < 0.5) {
      return Math.round(mid);
    }
    if (mMid >= minMargin) a = mid;
    else b = mid;
  }
  return Math.round((a + b) / 2);
}
