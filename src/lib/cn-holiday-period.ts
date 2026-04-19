// 변경 이유: Nager 없이 화면에 쓰는 중국 연휴 구간 DTO를 단일 타입으로 둡니다.

/** 내장 공휴일표 vs Supabase 수동 입력 */
export type CnHolidayPeriod = {
  startDate: string;
  endDate: string;
  dayCount: number;
  needBridgeDay: boolean;
  bridgeDays: string[];
  labelKo: string;
  anchor: null;
  source?: "builtin" | "manual";
};
