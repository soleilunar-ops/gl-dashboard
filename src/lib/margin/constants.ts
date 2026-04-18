/** 환율 민감도 차트·BEP 탐색 시 사용하는 CNY/KRW 고정 구간 (기획서 170~230) */
export const EXCHANGE_SENSITIVITY_MIN = 170;
export const EXCHANGE_SENSITIVITY_MAX = 230;

/** 센터명 미매칭 시 밀크런 basic 단가 폴백 (원/파레트, VAT 별도) */
export const DEFAULT_MILKRUN_BASIC_WHEN_UNKNOWN = 44700;

/** 센터별 밀크런 단가 (원/파레트, VAT 별도) — BASIC / OVER */
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

/** 채널별 정산비율(실질 정산액 = Net × settlementRatio) 및 표시용 수수료율(%) */
export const CHANNEL_RATES = {
  coupang_rocket: { settlementRatio: 0.56, name: "쿠팡 로켓배송", fee: 44 },
  coupang_seller: { settlementRatio: 0.85, name: "쿠팡 판매자로켓", fee: 15 },
  naver: { settlementRatio: 0.965, name: "네이버 스마트스토어", fee: 3.5 },
  gmarket: { settlementRatio: 0.89, name: "지마켓", fee: 11 },
  ssg: { settlementRatio: 0.88, name: "SSG닷컴", fee: 12 },
  kakao: { settlementRatio: 0.93, name: "카카오선물하기", fee: 7 },
} as const;

export type ChannelKey = keyof typeof CHANNEL_RATES;
