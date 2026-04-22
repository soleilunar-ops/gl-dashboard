"use client";

/**
 * 이 훅이 공급하는 데이터 (프로모션 분석 4탭 공통)
 * - monthly: 시즌·월 단위 판매(coupang_daily_performance) + 4종 비용 + 날씨(월 평균) 집계
 * - seasonSummary: 시즌별 합계·비용률·ROI 요약(baseline_kpi_snapshot 값으로 avgRoi·bestRoiMonth 보강)
 * - couponContracts: 쿠폰 계약 목록(수동 입력 쿠폰명·종류 포함)
 * - currentSeason: season_config에서 진행 중(is_closed=false)인 시즌 키
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type SeasonKey = string;

export type MonthlyAggregate = {
  yearMonth: string;
  season: SeasonKey;
  seasonMonthIndex: number;
  isBaseline: boolean;
  couponCost: number;
  adCost: number;
  premiumDataCost: number;
  milkrunCost: number;
  totalCost: number;
  variableCost: number;
  gmv: number;
  unitsSold: number;
  cogs: number;
  actualMarginRate: number;
  avgTemp: number | null;
  tempAnomaly: number | null;
};

export type SeasonSummary = {
  season: SeasonKey;
  isBaseline: boolean;
  totalGmv: number;
  totalCost: number;
  variableCost: number;
  costRatio: number;
  avgRoi: number;
  bestRoiMonth: string;
};

export type CouponContract = {
  contractNo: number;
  startDate: string;
  endDate: string;
  paidAmount: number;
  couponName: string | null;
  couponCategory: string | null;
  season: SeasonKey;
  isBaseline: boolean;
};

export type PromotionPipelineData = {
  monthly: MonthlyAggregate[];
  seasonSummary: Record<SeasonKey, SeasonSummary>;
  couponContracts: CouponContract[];
  currentSeason: SeasonKey | null;
  closedSeasons: SeasonKey[];
  seasonConfigs: Array<{
    season: SeasonKey;
    startDate: string;
    endDate: string;
    isClosed: boolean;
  }>;
};

type UsePromotionResult = {
  data: PromotionPipelineData | null;
  loading: boolean;
  error: string | null;
};

type DailyPerfRow = Pick<
  Tables<"coupang_daily_performance">,
  "date" | "gmv" | "cogs" | "units_sold" | "season" | "is_baseline"
>;
type AdCostRow = Pick<
  Tables<"promotion_ad_costs">,
  "year_month" | "paid_amount" | "season" | "is_baseline"
>;
type PremiumRow = Pick<
  Tables<"promotion_premium_data_costs">,
  "year_month" | "amount" | "season" | "is_baseline"
>;
type MilkRow = Pick<
  Tables<"promotion_milkrun_costs">,
  "year_month" | "amount" | "season" | "is_baseline"
>;
type CouponRow = Pick<
  Tables<"promotion_coupon_contracts">,
  | "contract_no"
  | "start_date"
  | "end_date"
  | "paid_amount"
  | "coupon_name"
  | "coupon_category"
  | "season"
  | "is_baseline"
>;
type WeatherRow = Pick<Tables<"weather_daily_legacy">, "date" | "avg_temp" | "temp_anomaly">;
type BaselineKpiRow = Tables<"baseline_kpi_snapshot">;
type SeasonCfgRow = Pick<
  Tables<"season_config">,
  "season" | "start_date" | "end_date" | "is_closed"
>;

type RawBundle = {
  dailyPerf: DailyPerfRow[];
  adCosts: AdCostRow[];
  premiumCosts: PremiumRow[];
  milkrunCosts: MilkRow[];
  couponContracts: CouponRow[];
  weather: WeatherRow[];
  baselineKpi: BaselineKpiRow[];
  seasonConfig: SeasonCfgRow[];
};

const PAGE_SIZE = 8000;

/** weather_daily 전 구간 조회(시즌·baseline 무관). Supabase 기본 행 제한 대비 페이지 단위로 수집 */
const WEATHER_RANGE_START = "2024-09-01";
const WEATHER_RANGE_END = "2026-12-31";
const WEATHER_FETCH_PAGE = 10_000;

function normalizeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "알 수 없는 오류";
  }
}

/** weather_daily 일자 → 월별 평균(avg_temp, temp_anomaly) 집계용 버킷 */
type WeatherMonthAgg = { temps: number[]; anomalies: number[] };

function monthStart(isoYm: string): Date {
  const [y, m] = isoYm.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function addMonths(d: Date, delta: number): Date {
  const n = new Date(d);
  n.setMonth(n.getMonth() + delta);
  return n;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 계약 기간이 포함하는 달력 월(yearMonth) 목록 */
function yearMonthsInContractRange(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(end.getFullYear(), end.getMonth(), 1);
  const out: string[] = [];
  while (cur <= endM) {
    out.push(ymKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

/** 변경 이유: weather_daily는 날짜 구간만 지정해 전량 가져오고, 시즌/베이스라인과 무관하게 탭1 히트맵에 씁니다. */
async function fetchWeatherDailyInRange(
  supabase: ReturnType<typeof createClient>
): Promise<WeatherRow[]> {
  const acc: WeatherRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + WEATHER_FETCH_PAGE - 1;
    const { data, error } = await supabase
      .from("weather_daily_legacy")
      .select("date, avg_temp, temp_anomaly")
      .gte("date", WEATHER_RANGE_START)
      .lte("date", WEATHER_RANGE_END)
      .order("date", { ascending: true })
      .range(from, to);
    if (error) throw new Error(`weather_daily_legacy: ${error.message}`);
    const chunk = data ?? [];
    acc.push(...chunk);
    if (chunk.length < WEATHER_FETCH_PAGE) break;
    from += WEATHER_FETCH_PAGE;
  }
  return acc;
}

async function fetchAllRows<T>(
  label: string,
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const acc: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(`${label}: ${error.message}`);
    const chunk = data ?? [];
    acc.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return acc;
}

function inferSeasonForYm(
  ym: string,
  seasonConfig: SeasonCfgRow[],
  fallback: SeasonKey | null
): SeasonKey | null {
  const t = monthStart(ym).getTime();
  for (const c of seasonConfig) {
    const s = new Date(c.start_date).getTime();
    const e = new Date(c.end_date).getTime();
    if (!Number.isNaN(s) && !Number.isNaN(e) && t >= s && t <= e) return c.season;
  }
  return fallback;
}

function seasonMonthIndexFor(
  season: SeasonKey,
  yearMonth: string,
  seasonConfig: SeasonCfgRow[]
): number {
  const cfg = seasonConfig.find((c) => c.season === season);
  if (!cfg) return 1;
  const target = monthStart(yearMonth);
  let cur = new Date(
    new Date(cfg.start_date).getFullYear(),
    new Date(cfg.start_date).getMonth(),
    1
  );
  const endM = new Date(new Date(cfg.end_date).getFullYear(), new Date(cfg.end_date).getMonth(), 1);
  let idx = 0;
  while (cur <= endM) {
    idx += 1;
    if (cur.getFullYear() === target.getFullYear() && cur.getMonth() === target.getMonth())
      return idx;
    cur = addMonths(cur, 1);
  }
  return Math.min(Math.max(idx, 1), 7);
}

function buildMonthlyKey(yearMonth: string, season: SeasonKey, isBaseline: boolean): string {
  return `${yearMonth}\u0000${season}\u0000${isBaseline ? "1" : "0"}`;
}

function aggregateFromRaw(raw: RawBundle): PromotionPipelineData {
  const seasonConfig = raw.seasonConfig ?? [];

  type Bucket = {
    yearMonth: string;
    season: SeasonKey;
    isBaseline: boolean;
    gmv: number;
    unitsSold: number;
    cogs: number;
    couponCost: number;
    adCost: number;
    premiumDataCost: number;
    milkrunCost: number;
  };

  const buckets = new Map<string, Bucket>();

  const touch = (yearMonth: string, season: SeasonKey, isBaseline: boolean): Bucket => {
    const k = buildMonthlyKey(yearMonth, season, isBaseline);
    let b = buckets.get(k);
    if (!b) {
      b = {
        yearMonth,
        season,
        isBaseline,
        gmv: 0,
        unitsSold: 0,
        cogs: 0,
        couponCost: 0,
        adCost: 0,
        premiumDataCost: 0,
        milkrunCost: 0,
      };
      buckets.set(k, b);
    }
    return b;
  };

  // 1) 일별 실적 → 월·시즌·baseline 그룹 (날씨 merge 키와 동일하게 date 문자열의 YYYY-MM 사용)
  for (const row of raw.dailyPerf) {
    const ym = String(row.date).substring(0, 7);
    const isBaseline = Boolean(row.is_baseline);
    const season =
      (row.season && String(row.season)) ||
      inferSeasonForYm(ym, seasonConfig, "25시즌") ||
      "25시즌";
    const b = touch(ym, season, isBaseline);
    b.gmv += Number(row.gmv) || 0;
    b.unitsSold += Number(row.units_sold) || 0;
    b.cogs += Number(row.cogs) || 0;
  }

  const addCost = (
    yearMonth: string,
    season: string | null,
    isBaseline: boolean | null,
    field: "adCost" | "premiumDataCost" | "milkrunCost",
    amount: number
  ) => {
    const bl = Boolean(isBaseline);
    const sea =
      (season && String(season)) || inferSeasonForYm(yearMonth, seasonConfig, null) || "25시즌";
    const b = touch(yearMonth, sea, bl);
    b[field] += amount;
  };

  for (const r of raw.adCosts) {
    addCost(r.year_month, r.season, r.is_baseline, "adCost", Number(r.paid_amount) || 0);
  }
  for (const r of raw.premiumCosts) {
    addCost(r.year_month, r.season, r.is_baseline, "premiumDataCost", Number(r.amount) || 0);
  }
  for (const r of raw.milkrunCosts) {
    addCost(r.year_month, r.season, r.is_baseline, "milkrunCost", Number(r.amount) || 0);
  }

  // 쿠폰: 계약 기간 월에 균등 배분
  for (const c of raw.couponContracts) {
    const paid = Number(c.paid_amount) || 0;
    const months = yearMonthsInContractRange(c.start_date ?? "", c.end_date ?? "");
    if (!months.length || paid === 0) continue;
    const per = paid / months.length;
    const sea = (c.season && String(c.season)) || "25시즌";
    const bl = Boolean(c.is_baseline);
    for (const ym of months) {
      touch(ym, sea, bl).couponCost += per;
    }
  }

  const monthly: MonthlyAggregate[] = [];

  for (const [, b] of buckets) {
    const variableCost = b.couponCost + b.adCost + b.milkrunCost;
    const totalCost = variableCost + b.premiumDataCost;
    const gmv = b.gmv;
    const actualMarginRate = gmv > 0 ? (gmv - b.cogs) / gmv : 0;
    const seasonMonthIndex = seasonMonthIndexFor(b.season, b.yearMonth, seasonConfig);

    monthly.push({
      yearMonth: b.yearMonth,
      season: b.season,
      seasonMonthIndex,
      isBaseline: b.isBaseline,
      couponCost: b.couponCost,
      adCost: b.adCost,
      premiumDataCost: b.premiumDataCost,
      milkrunCost: b.milkrunCost,
      totalCost,
      variableCost,
      gmv,
      unitsSold: b.unitsSold,
      cogs: b.cogs,
      actualMarginRate,
      avgTemp: null,
      tempAnomaly: null,
    });
  }

  monthly.sort((a, b) => {
    const c = a.yearMonth.localeCompare(b.yearMonth);
    if (c !== 0) return c;
    if (a.season !== b.season) return a.season.localeCompare(b.season);
    return Number(a.isBaseline) - Number(b.isBaseline);
  });

  // 날씨: 완성된 monthly에만 주입 (시즌 분기 밖, weather_daily date → YYYY-MM substring)
  const weatherByMonth = new Map<string, WeatherMonthAgg>();
  for (const row of raw.weather) {
    const ym = String(row.date).substring(0, 7);
    let bucket = weatherByMonth.get(ym);
    if (!bucket) {
      bucket = { temps: [], anomalies: [] };
      weatherByMonth.set(ym, bucket);
    }
    if (
      row.avg_temp !== null &&
      row.avg_temp !== undefined &&
      Number.isFinite(Number(row.avg_temp))
    ) {
      bucket.temps.push(Number(row.avg_temp));
    }
    if (
      row.temp_anomaly !== null &&
      row.temp_anomaly !== undefined &&
      Number.isFinite(Number(row.temp_anomaly))
    ) {
      bucket.anomalies.push(Number(row.temp_anomaly));
    }
  }

  console.log("[디버그] weather month keys:", [...weatherByMonth.keys()].sort());

  monthly.forEach((m) => {
    const w = weatherByMonth.get(m.yearMonth);
    if (w && w.temps.length > 0) {
      m.avgTemp = w.temps.reduce((a, b) => a + b, 0) / w.temps.length;
    }
    if (w && w.anomalies.length > 0) {
      m.tempAnomaly = w.anomalies.reduce((a, b) => a + b, 0) / w.anomalies.length;
    }
  });

  // 시즌 요약
  const seasonSummary: Record<SeasonKey, SeasonSummary> = {};
  const bySeason = new Map<SeasonKey, MonthlyAggregate[]>();
  for (const m of monthly) {
    const list = bySeason.get(m.season) ?? [];
    list.push(m);
    bySeason.set(m.season, list);
  }

  for (const [season, rows] of bySeason) {
    const isBaseline = rows.length > 0 && rows.every((r) => r.isBaseline);
    let totalGmv = 0;
    let totalCost = 0;
    let variableCost = 0;
    for (const r of rows) {
      totalGmv += r.gmv;
      totalCost += r.totalCost;
      variableCost += r.variableCost;
    }
    const costRatio = totalGmv > 0 ? totalCost / totalGmv : 0;

    let bestYm = "";
    let bestRoi = -Infinity;
    for (const r of rows) {
      const roiM = r.variableCost > 0 ? (r.gmv - r.cogs) / r.variableCost : 0;
      if (Number.isFinite(roiM) && roiM > bestRoi) {
        bestRoi = roiM;
        bestYm = r.yearMonth;
      }
    }
    let avgRoi = 0;
    if (variableCost > 0) {
      const contrib = rows.reduce((s, r) => s + (r.gmv - r.cogs), 0);
      avgRoi = contrib / variableCost;
    }

    seasonSummary[season] = {
      season,
      isBaseline,
      totalGmv,
      totalCost,
      variableCost,
      costRatio,
      avgRoi: Number.isFinite(avgRoi) ? avgRoi : 0,
      bestRoiMonth: bestYm || "",
    };
  }

  // baseline_kpi_snapshot으로 baseline 시즌 KPI 보강
  for (const snap of raw.baselineKpi) {
    const s = snap.season;
    if (!seasonSummary[s]) continue;
    const cur = seasonSummary[s];
    if (
      snap.avg_roi !== null &&
      snap.avg_roi !== undefined &&
      Number.isFinite(Number(snap.avg_roi))
    ) {
      cur.avgRoi = Number(snap.avg_roi);
    }
    if (snap.best_roi_month) {
      cur.bestRoiMonth = snap.best_roi_month;
    }
    if (snap.total_gmv !== null && snap.total_gmv !== undefined) {
      cur.totalGmv = Number(snap.total_gmv);
    }
    if (snap.total_cost !== null && snap.total_cost !== undefined) {
      cur.totalCost = Number(snap.total_cost);
    }
    if (
      snap.cost_ratio !== null &&
      snap.cost_ratio !== undefined &&
      Number.isFinite(Number(snap.cost_ratio))
    ) {
      cur.costRatio = Number(snap.cost_ratio);
    }
  }

  // season_config에만 있고 월 데이터가 없는 시즌은 스냅샷 또는 빈 요약 유지
  for (const c of seasonConfig) {
    if (!seasonSummary[c.season]) {
      const snap = raw.baselineKpi.find((k) => k.season === c.season);
      seasonSummary[c.season] = {
        season: c.season,
        isBaseline: true,
        totalGmv: snap?.total_gmv != null ? Number(snap.total_gmv) : 0,
        totalCost: snap?.total_cost != null ? Number(snap.total_cost) : 0,
        variableCost: 0,
        costRatio: snap?.cost_ratio != null ? Number(snap.cost_ratio) : 0,
        avgRoi: snap?.avg_roi != null ? Number(snap.avg_roi) : 0,
        bestRoiMonth: snap?.best_roi_month ?? "",
      };
    }
  }

  const couponContracts: CouponContract[] = raw.couponContracts.map((c) => ({
    contractNo: c.contract_no,
    startDate: c.start_date ?? "",
    endDate: c.end_date ?? "",
    paidAmount: Number(c.paid_amount) || 0,
    couponName: c.coupon_name ?? null,
    couponCategory: c.coupon_category ?? null,
    season: (c.season && String(c.season)) || "25시즌",
    isBaseline: Boolean(c.is_baseline),
  }));

  const openSeasons = seasonConfig.filter((c) => c.is_closed === false);
  openSeasons.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  const currentSeason = openSeasons[0]?.season ?? null;
  const closedSeasons = seasonConfig
    .filter((c) => c.is_closed === true)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
    .map((c) => c.season);

  const seasonConfigs = seasonConfig
    .map((c) => ({
      season: c.season,
      startDate: c.start_date,
      endDate: c.end_date,
      isClosed: Boolean(c.is_closed),
    }))
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  console.log(
    "[탭1] monthly weather data:",
    monthly.map((m) => ({
      month: m.yearMonth,
      season: m.season,
      avgTemp: m.avgTemp,
      tempAnomaly: m.tempAnomaly,
    }))
  );

  return { monthly, seasonSummary, couponContracts, currentSeason, closedSeasons, seasonConfigs };
}

export function usePromotion(): UsePromotionResult {
  const supabase = useMemo(() => createClient(), []);
  const [raw, setRaw] = useState<RawBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        dailyPerf,
        adCosts,
        premiumCosts,
        milkrunCosts,
        couponContracts,
        weather,
        baselineKpi,
        seasonCfgRes,
      ] = await Promise.all([
        fetchAllRows<DailyPerfRow>("coupang_daily_performance", (from, to) =>
          supabase
            .from("coupang_daily_performance")
            .select("date, gmv, cogs, units_sold, season, is_baseline")
            .order("date", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<AdCostRow>("promotion_ad_costs", (from, to) =>
          supabase
            .from("promotion_ad_costs")
            .select("year_month, paid_amount, season, is_baseline")
            .order("year_month", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<PremiumRow>("promotion_premium_data_costs", (from, to) =>
          supabase
            .from("promotion_premium_data_costs")
            .select("year_month, amount, season, is_baseline")
            .order("year_month", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<MilkRow>("promotion_milkrun_costs", (from, to) =>
          supabase
            .from("promotion_milkrun_costs")
            .select("year_month, amount, season, is_baseline")
            .order("year_month", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<CouponRow>("promotion_coupon_contracts", (from, to) =>
          supabase
            .from("promotion_coupon_contracts")
            .select(
              "contract_no, start_date, end_date, paid_amount, coupon_name, coupon_category, season, is_baseline"
            )
            .order("contract_no", { ascending: true })
            .range(from, to)
        ),
        fetchWeatherDailyInRange(supabase),
        fetchAllRows<BaselineKpiRow>("baseline_kpi_snapshot", (from, to) =>
          supabase
            .from("baseline_kpi_snapshot")
            .select("*")
            .order("season", { ascending: true })
            .range(from, to)
        ),
        supabase
          .from("season_config")
          .select("season, start_date, end_date, is_closed")
          .order("start_date", { ascending: true }),
      ]);

      if (seasonCfgRes.error) {
        throw new Error(seasonCfgRes.error.message);
      }

      console.log("[디버그] weather rows total:", weather.length);

      setRaw({
        dailyPerf,
        adCosts,
        premiumCosts,
        milkrunCosts,
        couponContracts,
        weather,
        baselineKpi,
        seasonConfig: (seasonCfgRes.data ?? []) as SeasonCfgRow[],
      });
    } catch (e) {
      setRaw(null);
      setError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(() => (raw ? aggregateFromRaw(raw) : null), [raw]);

  return { data, loading, error };
}
