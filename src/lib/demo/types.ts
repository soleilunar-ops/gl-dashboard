// 08 v0.3 — 시즌 프로파일 타입. 데모 엔진은 DB 조회 없이 상수만.

export type SeasonProfileId = "pre_season" | "first_freeze" | "peak" | "late_season" | "off_season";

export interface SeasonProfile {
  id: SeasonProfileId;
  label: string;
  activeMonths: number[];

  header: {
    dateISO: string;
    dayLabel: string;
    seasonLabel: string;
    metaLine: string;
  };

  weather: {
    tempC: number;
    feelsLikeC: number;
    description: string;
    location: string;
    latitude: number;
    precipitation: Array<{ hour: number; percent: number }>;
    triggers: {
      tempDiffFromYesterday: number;
      firstSubzeroDate: string | null;
      daysEarlierThanLastYear: number;
    };
    insight: { headline: string; sub: string };
  };

  inventory: {
    top3: Array<{
      name: string;
      spec: string;
      glStock: number;
      coupangStock: number;
      glPercent: number;
      coupangPercent: number;
      status: "여유" | "적정" | "부족";
      approximate: boolean;
    }>;
    inTransit: {
      contractNumber: string;
      from: string;
      departureDate: string;
      pajuEta: string;
      quantity: number;
      currentStep: 1 | 2 | 3;
    } | null;
    arrivingToday: {
      blNumber: string;
      totalQuantity: number;
      items: Array<{ name: string; quantity: number }>;
    } | null;
    insight: { headline: string; sub: string };
  };

  action: {
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      tag: "긴급" | "오늘" | "이번주";
    }>;
    searchVolume: {
      dailyChangePercent: number;
      sparkline: number[];
      startDate: string;
      endDate: string;
    };
    insight: { headline: string; sub: string };
  };
}
