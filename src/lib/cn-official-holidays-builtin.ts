// 변경 이유: 2026년 국무원판공실 법정공휴일(북경일보 등 보도 기준)을 API 없이 기본 표시합니다.
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { CnHolidayPeriod } from "@/lib/cn-holiday-period";

function inclusiveDayCount(startYmd: string, endYmd: string): number {
  return (
    differenceInCalendarDays(parseISO(`${endYmd}T12:00:00`), parseISO(`${startYmd}T12:00:00`)) + 1
  );
}

function period(
  labelKo: string,
  start: string,
  end: string,
  bridgeDays: string[] = []
): CnHolidayPeriod {
  const dayCount = inclusiveDayCount(start, end);
  return {
    startDate: start,
    endDate: end,
    dayCount,
    needBridgeDay: bridgeDays.length > 0,
    bridgeDays,
    labelKo,
    anchor: null,
    source: "builtin",
  };
}

/**
 * 2026년 법정공휴일 연휴 구간(대체 근무일은 bridgeDays에 넣어 ‘연결일’ 안내에 사용).
 * 출처: 중 국무원판공실 발표(북경일보 등 2025.11 보도 요약).
 */
const CN_BUILTIN_2026: CnHolidayPeriod[] = [
  period("신정", "2026-01-01", "2026-01-03", ["2026-01-04"]),
  period("춘절", "2026-02-15", "2026-02-23", ["2026-02-14", "2026-02-28"]),
  period("청명절", "2026-04-04", "2026-04-06", []),
  period("노동절", "2026-05-01", "2026-05-05", ["2026-05-09"]),
  period("단오절", "2026-06-19", "2026-06-21", []),
  period("중추절", "2026-09-25", "2026-09-27", []),
  period("국경절", "2026-10-01", "2026-10-07", ["2026-09-20", "2026-10-10"]),
];

/** 단일 연도 내장표(등록된 연도만, 없으면 빈 배열) */
export function getBuiltinCnHolidayPeriodsForYear(year: number): CnHolidayPeriod[] {
  if (year === 2026) return [...CN_BUILTIN_2026];
  return [];
}

/** 연도 목록에 맞춰 내장표 합침(중복 연도는 한 번만) */
export function getBuiltinCnHolidayPeriodsForYears(years: number[]): CnHolidayPeriod[] {
  const out: CnHolidayPeriod[] = [];
  for (const y of new Set(years)) {
    out.push(...getBuiltinCnHolidayPeriodsForYear(y));
  }
  return out;
}
