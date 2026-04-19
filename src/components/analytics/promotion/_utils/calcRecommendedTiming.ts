import type { CouponContract } from "@/components/analytics/promotion/_hooks/usePromotion";

/** 계약 시작일이 속한 달의 주차(1~4, 상단 7일 단위) */
function weekOfMonthFromIso(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 1;
  const day = d.getDate();
  return Math.min(4, Math.ceil(day / 7));
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdSample(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

/** 연속된 주차 구간(예: 1~2주)이 전부 포함되는지 */
function isEarlyTwoWeekCluster(weeks: number[]): boolean {
  const u = [...new Set(weeks)].sort((a, b) => a - b);
  if (u.length < 2) return false;
  return u[0] === 1 && u[1] === 2 && u.every((w) => w <= 2);
}

/** 시즌월 인덱스(9월=1…3월=7)에 맞는 baseline 쿠폰 계약 부분집합 */
function baselineContractsForSeasonMonth(
  contracts: CouponContract[],
  seasonMonthIndex: number
): CouponContract[] {
  const baseline = contracts.filter((c) => c.isBaseline);
  if (seasonMonthIndex >= 2 && seasonMonthIndex <= 6) {
    const catByIdx: Record<number, string> = {
      2: "10월",
      3: "11월",
      4: "12월",
      5: "1월",
      6: "2월",
    };
    const cat = catByIdx[seasonMonthIndex];
    return baseline.filter((c) => c.couponCategory === cat);
  }
  const wantMonthJs = seasonMonthIndex === 1 ? 8 : 2;
  return baseline.filter((c) => {
    const m = new Date(c.startDate).getMonth();
    return m === wantMonthJs;
  });
}

/**
 * baseline 쿠폰 계약 시작일 패턴으로 시즌월별 권장 집행 타이밍 + 대표 쿠폰명(1~2개) 문구 생성.
 * @param contracts usePromotion().data.couponContracts
 * @param seasonMonthIndex 시즌 내 월 순서 (9월=1 … 3월=7)
 */
export function calcRecommendedTiming(
  contracts: CouponContract[],
  seasonMonthIndex: number
): string {
  const subset = baselineContractsForSeasonMonth(contracts, seasonMonthIndex);

  if (subset.length === 0) return "계약 없음";

  const weeks = subset.map((c) => weekOfMonthFromIso(c.startDate));
  const m = mean(weeks);
  const s = stdSample(weeks);

  let timing: string;
  if (isEarlyTwoWeekCluster(weeks)) {
    timing = "월초 2주 연속";
  } else if (s >= 1.15) {
    timing = "월 전체 분산";
  } else if (m < 1.75) {
    timing = "월초 집중";
  } else if (m < 2.75) {
    timing = "2주차 집중";
  } else if (m < 3.5) {
    timing = "3주차 집중";
  } else {
    timing = "월말 집중";
  }

  const names = [
    ...new Set(
      subset
        .map((c) => c.couponName)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n) => n.trim())
    ),
  ].slice(0, 2);

  if (!names.length) return timing;
  return `${timing} (${names.join(", ")})`;
}
