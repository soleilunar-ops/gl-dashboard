import type { LeadTimeRow, LeadtimeDbStep } from "@/components/logistics/_hooks/useLeadTime";

/** DB 컬럼 step2(카고레디)는 사용하지 않고, 상하이~파주는 BL·공공데이터·유니패스로 추적 */
export const DB_STEPS: readonly { db: LeadtimeDbStep; label: string }[] = [
  { db: 1, label: "① 발주일" },
  { db: 3, label: "② 상하이 출항" },
  { db: 4, label: "③ 인천 입항" },
  { db: 5, label: "④ 파주 창고 입고" },
];

/** 두 날짜 차이 (일) */
export const calcDelay = (actual: string, expected: string): number =>
  Math.round((new Date(actual).getTime() - new Date(expected).getTime()) / 86400000);

/** YYYY-MM-DD 기준으로 일수 빼기 */
export const subtractCalendarDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
};

/** 입항(예정)·실제 기준으로 상하이 출항 예상일 자동 산출 */
export function getComputedShanghaiExpected(row: LeadTimeRow): string | null {
  if (row.step4_expected) {
    return subtractCalendarDays(row.step4_expected, row.sea_days);
  }
  if (row.step4_actual) {
    return subtractCalendarDays(row.step4_actual, row.sea_days);
  }
  return null;
}

/** 전체 최대 지연 (비교 가능한 쌍이 없으면 hasAny: false) */
export const getMaxDelay = (row: LeadTimeRow): { max: number; hasAny: boolean } => {
  const delays: number[] = [];
  const shanghaiExp = row.step3_expected ?? getComputedShanghaiExpected(row);
  if (row.step3_actual && shanghaiExp) {
    delays.push(calcDelay(row.step3_actual, shanghaiExp));
  }
  if (row.step4_actual && row.step4_expected) {
    delays.push(calcDelay(row.step4_actual, row.step4_expected));
  }
  if (row.step5_actual && row.step5_expected) {
    delays.push(calcDelay(row.step5_actual, row.step5_expected));
  }
  if (!delays.length) return { max: 0, hasAny: false };
  return { max: Math.max(...delays), hasAny: true };
};

export const getStatus = (row: LeadTimeRow): "완료" | "주의" | "정상" => {
  if (row.is_approved) return "완료";
  const { max, hasAny } = getMaxDelay(row);
  if (hasAny && max >= 3) return "주의";
  return "정상";
};

export function currentStageLabel(cs: number): string {
  if (cs <= 1) return DB_STEPS[0].label;
  if (cs === 2) return DB_STEPS[1].label;
  if (cs === 3) return DB_STEPS[1].label;
  if (cs === 4) return DB_STEPS[2].label;
  return DB_STEPS[3].label;
}

export function currentStagePillClass(cs: number): string {
  if (cs <= 1) return "bg-muted text-muted-foreground";
  if (cs === 2 || cs === 3) return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  if (cs === 4) return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
  return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
}

export function isStepCurrent(row: LeadTimeRow, dbStep: LeadtimeDbStep): boolean {
  if (dbStep === 1) {
    return row.current_step === 0 || row.current_step === 1 || row.current_step === 2;
  }
  return row.current_step === dbStep;
}

export function getActualValue(row: LeadTimeRow, dbStep: LeadtimeDbStep): string | null {
  if (dbStep === 1) return row.step1_actual;
  if (dbStep === 3) return row.step3_actual;
  if (dbStep === 4) return row.step4_actual;
  return row.step5_actual;
}

export function getExpectedValue(row: LeadTimeRow, dbStep: LeadtimeDbStep): string | null {
  if (dbStep === 1) return null;
  if (dbStep === 3) {
    return row.step3_expected ?? getComputedShanghaiExpected(row);
  }
  if (dbStep === 4) return row.step4_expected;
  if (dbStep === 5) return row.step5_expected;
  return null;
}

/** DB에 저장된 수기 예상일(②단계 자동참고 제외) */
export function getStoredExpected(row: LeadTimeRow, dbStep: LeadtimeDbStep): string | null {
  if (dbStep === 1) return null;
  if (dbStep === 3) return row.step3_expected;
  if (dbStep === 4) return row.step4_expected;
  return row.step5_expected;
}

export function stepCardClass(row: LeadTimeRow, dbStep: LeadtimeDbStep): string {
  const done = !!getActualValue(row, dbStep);
  const cur = isStepCurrent(row, dbStep);
  if (done) return "border-green-200 bg-green-50";
  if (cur) return "border-blue-200 bg-blue-50";
  return "bg-muted/30 border-transparent";
}
