// 변경 이유: 기상청 API·재작업일 계산을 KST 달력 기준으로 통일합니다.
import { addDays, format, parseISO } from "date-fns";

export function todayKstYmdDash(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function kstHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
}

/** 출고일(스케줄 기준일)로부터 재작업일 D-2, D-1 (KST 달력) */
export function reworkDatesFromOrderDate(orderDateYmd: string): {
  dMinus2: string;
  dMinus1: string;
} {
  const base = parseISO(`${orderDateYmd}T12:00:00+09:00`);
  return {
    dMinus2: format(addDays(base, -2), "yyyy-MM-dd"),
    dMinus1: format(addDays(base, -1), "yyyy-MM-dd"),
  };
}

/** targetYmd − todayYmd (일 수, KST) */
export function kstDiffDaysFromToday(targetYmd: string, now: Date = new Date()): number {
  const today = todayKstYmdDash(now);
  const t0 = parseISO(`${today}T12:00:00+09:00`).getTime();
  const t1 = parseISO(`${targetYmd}T12:00:00+09:00`).getTime();
  return Math.round((t1 - t0) / 86400000);
}

export function ymdDashToCompact(ymd: string): string {
  return ymd.replace(/-/g, "");
}
