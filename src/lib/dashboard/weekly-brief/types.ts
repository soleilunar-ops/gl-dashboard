// 07 v0.2 — 주간 리포트 타입.

export interface GateResult {
  allowed: boolean;
  reason?: string;
  count_this_week: number;
  limit: number;
  next_available?: "this_monday" | "this_friday" | "next_monday";
}

export interface WeeklyBriefInsight {
  headline: string;
  body: string;
  alerts: string[];
  next_week: string[];
}

export interface WeeklyBriefSections {
  sales_highlight?: string;
  weather_trigger?: string;
  transport?: string;
}

export interface WeeklyBriefBody {
  metadata: {
    week_start: string;
    week_end: string;
    template: "hotpack_season" | "off_season";
  };
  sections: WeeklyBriefSections;
  insight: WeeklyBriefInsight;
}

export interface WeeklyBriefRow {
  id: string;
  season: string;
  kind: "weekly_brief";
  body_md: string;
  model: string;
  generated_at: string;
}

export interface WeeklyBriefParsed extends WeeklyBriefRow {
  parsed: WeeklyBriefBody;
}

export type SectionKey = keyof WeeklyBriefSections;
