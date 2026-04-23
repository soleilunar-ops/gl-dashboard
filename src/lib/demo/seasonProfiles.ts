// 08 v0.3 — 5개 시즌 프로파일. Phase 1은 peak만 완성, 나머지는 타입 스켈레톤.
import type { SeasonProfile, SeasonProfileId } from "./types";

export const MAIN_DASHBOARD_PROFILE_ID: SeasonProfileId = "peak";

const peak: SeasonProfile = {
  id: "peak",
  label: "시즌 피크",
  activeMonths: [12, 1],

  header: {
    dateISO: "2025-12-03",
    dayLabel: "2025년 12월 3일 수요일",
    seasonLabel: "핫팩 시즌",
    metaLine: "D+95 · 쿠팡 시즌 피크 구간",
  },

  weather: {
    tempC: -8,
    feelsLikeC: -14,
    description: "맑음, 찬 바람",
    location: "파주",
    latitude: 37.76,
    precipitation: [
      { hour: 6, percent: 5 },
      { hour: 9, percent: 10 },
      { hour: 12, percent: 10 },
      { hour: 15, percent: 15 },
      { hour: 18, percent: 10 },
      { hour: 21, percent: 5 },
    ],
    triggers: {
      tempDiffFromYesterday: -3.4,
      firstSubzeroDate: "2025-11-18",
      daysEarlierThanLastYear: -7,
    },
    insight: {
      headline: "한파 피크 구간입니다.",
      sub: "수요 최대 · 야외 재포장 작업 가능",
    },
  },

  inventory: {
    top3: [
      {
        name: "붙이는 불가마",
        spec: "50g",
        glStock: 4_200,
        coupangStock: 630,
        glPercent: 52,
        coupangPercent: 15,
        status: "부족",
        approximate: true,
      },
      {
        name: "박일병 핫팩",
        spec: "150g",
        glStock: 8_940,
        coupangStock: 1_420,
        glPercent: 78,
        coupangPercent: 38,
        status: "적정",
        approximate: false,
      },
      {
        name: "군인 핫팩",
        spec: "160g",
        glStock: 2_820,
        coupangStock: 180,
        glPercent: 45,
        coupangPercent: 7,
        status: "부족",
        approximate: false,
      },
    ],
    inTransit: {
      contractNumber: "PO-2025-1108",
      from: "상해",
      departureDate: "2025-11-08",
      pajuEta: "2025-12-03",
      quantity: 25_000,
      currentStep: 1,
    },
    arrivingToday: {
      blNumber: "SGSH25120345",
      totalQuantity: 50_000,
      items: [
        { name: "붙이는 불가마 50g", quantity: 20_000 },
        { name: "박일병 핫팩 150g", quantity: 18_000 },
        { name: "군인 핫팩 160g", quantity: 12_000 },
      ],
    },
    insight: {
      headline: "군인 핫팩 160g 쿠팡 재고 180개 잔여.",
      sub: "3일 내 품절 예상 · 자사 2,820개로 밀크런 즉시 처리 권장",
    },
  },

  action: {
    tasks: [
      {
        id: "t1",
        title: "쿠팡 군인 핫팩 발주 처리",
        description: "리드타임 2주 · 권장 수량 5,000개",
        tag: "긴급",
      },
      {
        id: "t2",
        title: "파주 도착 물류 재포장 작업",
        description: "오전 중 · 50,000개 완료",
        tag: "오늘",
      },
      {
        id: "t3",
        title: "생산외주 추가 주문",
        description: "12월 쿠팡 발주 대비 · 원부자재 기확보",
        tag: "이번주",
      },
    ],
    searchVolume: {
      dailyChangePercent: 28,
      sparkline: [72, 78, 85, 88, 91, 93, 94],
      startDate: "2025-11-27",
      endDate: "2025-12-03",
    },
    insight: {
      headline: "검색량 최고치 구간.",
      sub: "과거 피크 구간 평균 판매량 +180% 기록 · 재고 충당이 핵심",
    },
  },
};

// Phase 2에서 값 채울 스켈레톤 (타입 만족 최소값)
const stub = (
  id: SeasonProfileId,
  label: string,
  months: number[],
  dateISO: string,
  dayLabel: string,
  seasonLabel: string,
  metaLine: string
): SeasonProfile => ({
  id,
  label,
  activeMonths: months,
  header: { dateISO, dayLabel, seasonLabel, metaLine },
  weather: peak.weather,
  inventory: peak.inventory,
  action: peak.action,
});

export const SEASON_PROFILES: Record<SeasonProfileId, SeasonProfile> = {
  peak,
  pre_season: stub(
    "pre_season",
    "시즌 준비",
    [9, 10],
    "2025-10-15",
    "2025년 10월 15일 수요일",
    "시즌 준비",
    "D-45 · 시즌 진입 전"
  ),
  first_freeze: stub(
    "first_freeze",
    "첫 영하",
    [11],
    "2025-11-18",
    "2025년 11월 18일 화요일",
    "핫팩 시즌",
    "D+49 · 시즌 첫 영하 돌파"
  ),
  late_season: stub(
    "late_season",
    "시즌 후반",
    [2],
    "2026-02-10",
    "2026년 2월 10일 화요일",
    "핫팩 시즌",
    "D+163 · 수요 둔화 구간"
  ),
  off_season: stub(
    "off_season",
    "비시즌",
    [3, 4, 5, 6, 7, 8],
    "2026-04-22",
    "2026년 4월 22일 수요일",
    "비시즌",
    "비시즌 · 쿨링타올/의료용품 중심"
  ),
};
