"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "@/components/shared/StatCard";
import ChartContainer from "@/components/shared/ChartContainer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePromotion } from "@/components/analytics/promotion/_hooks/usePromotion";
import { cn } from "@/lib/utils";

export type TabProps = {
  data: NonNullable<ReturnType<typeof usePromotion>["data"]>;
};

/** 월별 ROI 차트 행 */
type RoiChartRow = {
  chartKey: string;
  xTickLabel: string;
  yearMonth: string;
  couponRoi: number | null;
  adRoi: number | null;
  milkrunRoi: number | null;
  /** 총 변동비용 ROI (프리미엄 제외) */
  variableTotalRoi: number | null;
  /** 총 ROI (프리미엄 포함, 라인용) */
  totalRoiIncl: number | null;
};

const COLOR_COUPON = "#3B82F6";
const COLOR_AD = "#F97316";
const COLOR_MILK = "#10B981";
const COLOR_VAR = "#991B1B";
const COLOR_TOTAL_LINE = "#EF4444";
const OCT_TO_MAR_MIN_INDEX = 2;
const OCT_TO_MAR_MAX_INDEX = 7;
const SEASON_WINDOW_OPTIONS = [
  // 시즌 라벨(24-25, 25-26)과 실제 season 키(24시즌, 25시즌)를 1:1로 맞춘다.
  { value: "24-25", season: "24시즌", label: "24년 10월 ~ 25년 3월" },
  { value: "25-26", season: "25시즌", label: "25년 10월 ~ 26년 3월" },
] as const;
type SeasonWindowValue = (typeof SEASON_WINDOW_OPTIONS)[number]["value"];

/** data.monthly의 actualMarginRate 평균 → 슬라이더 기본값(0~50%, 정수) */
function defaultMarginPctFromMonthly(monthly: { actualMarginRate: number }[]): number {
  const rates = monthly.map((m) => m.actualMarginRate).filter((r) => Number.isFinite(r) && r >= 0);
  if (!rates.length) return 30;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const pct = Math.round(mean * 100);
  return Math.min(50, Math.max(0, pct));
}

function marginProfit(gmv: number, marginPct: number): number {
  return gmv * (marginPct / 100);
}

/** 비용 0·비정상 시 null (막대 생략) */
function roiOrNull(profit: number, cost: number): number | null {
  if (cost <= 0 || !Number.isFinite(cost)) return null;
  const p = profit;
  if (!Number.isFinite(p)) return null;
  const r = p / cost;
  return Number.isFinite(r) && Math.abs(r) < 1e6 ? r : null;
}

function formatRoiX(roi: number | null, digits = 2): string {
  if (roi === null || !Number.isFinite(roi)) return "—";
  return `${roi.toFixed(digits)}x`;
}

function formatYearMonthShort(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y.slice(2)}.${m}`;
}

type TooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown; payload?: unknown }>;
  label?: string | number;
};

function RoiTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as RoiChartRow | undefined;
  if (!row) return null;
  const fmt = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}x`);

  return (
    <div className="bg-background border-border rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <ul className="text-muted-foreground space-y-0.5">
        <li>쿠폰 ROI: {fmt(row.couponRoi)}</li>
        <li>광고 ROI: {fmt(row.adRoi)}</li>
        <li>밀크런 ROI: {fmt(row.milkrunRoi)}</li>
        <li className="text-foreground font-medium">
          총 변동비용 ROI: {fmt(row.variableTotalRoi)}
        </li>
        <li className="text-foreground font-medium">
          총 ROI(프리미엄 포함): {fmt(row.totalRoiIncl)}
        </li>
      </ul>
    </div>
  );
}

export default function RoiAnalysisTab({ data }: TabProps) {
  const latestSeasonWindow = useMemo<SeasonWindowValue>(() => {
    const latestSeason = [...data.seasonConfigs].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    )[0]?.season;
    const matched = SEASON_WINDOW_OPTIONS.find((opt) => opt.season === latestSeason);
    return matched?.value ?? SEASON_WINDOW_OPTIONS[SEASON_WINDOW_OPTIONS.length - 1]!.value;
  }, [data.seasonConfigs]);
  const [seasonWindow, setSeasonWindow] = useState<SeasonWindowValue>(latestSeasonWindow);

  useEffect(() => {
    setSeasonWindow(latestSeasonWindow);
  }, [latestSeasonWindow]);
  const selectedWindow = useMemo(
    () =>
      SEASON_WINDOW_OPTIONS.find((opt) => opt.value === seasonWindow) ?? SEASON_WINDOW_OPTIONS[0],
    [seasonWindow]
  );
  const seasonalRows = useMemo(
    () =>
      data.monthly.filter(
        (m) =>
          m.seasonMonthIndex >= OCT_TO_MAR_MIN_INDEX &&
          m.seasonMonthIndex <= OCT_TO_MAR_MAX_INDEX &&
          m.season === selectedWindow.season
      ),
    [data.monthly, selectedWindow.season]
  );

  /** 같은 연월의 baseline/live를 합쳐 월별 한 행으로 만든다 (엑셀 업로드 후 분리 방지) */
  const mergedMonthlyRows = useMemo(() => {
    const buckets = new Map<
      string,
      {
        yearMonth: string;
        season: string;
        seasonMonthIndex: number;
        gmv: number;
        couponCost: number;
        adCost: number;
        milkrunCost: number;
        premiumDataCost: number;
        variableCost: number;
        totalCost: number;
        cogs: number;
        actualMarginRate: number;
      }
    >();

    for (const m of seasonalRows) {
      const key = m.yearMonth;
      const prev = buckets.get(key);
      if (!prev) {
        buckets.set(key, {
          yearMonth: m.yearMonth,
          season: m.season,
          seasonMonthIndex: m.seasonMonthIndex,
          gmv: m.gmv,
          couponCost: m.couponCost,
          adCost: m.adCost,
          milkrunCost: m.milkrunCost,
          premiumDataCost: m.premiumDataCost,
          variableCost: m.variableCost,
          totalCost: m.totalCost,
          cogs: m.cogs,
          actualMarginRate: m.actualMarginRate,
        });
        continue;
      }
      prev.gmv += m.gmv;
      prev.couponCost += m.couponCost;
      prev.adCost += m.adCost;
      prev.milkrunCost += m.milkrunCost;
      prev.premiumDataCost += m.premiumDataCost;
      prev.variableCost += m.variableCost;
      prev.totalCost += m.totalCost;
      prev.cogs += m.cogs;
      prev.actualMarginRate =
        prev.gmv > 0 ? (prev.gmv - prev.cogs) / prev.gmv : prev.actualMarginRate;
    }

    return [...buckets.values()].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  }, [seasonalRows]);

  const autoMarginPct = useMemo(
    () => defaultMarginPctFromMonthly(mergedMonthlyRows),
    [mergedMonthlyRows]
  );
  const [marginPct, setMarginPct] = useState(autoMarginPct);
  const [inputTouched, setInputTouched] = useState(false);

  useEffect(() => {
    if (!inputTouched) {
      setMarginPct(autoMarginPct);
    }
  }, [autoMarginPct, inputTouched]);

  const handleMarginInput = useCallback((raw: string) => {
    setInputTouched(true);
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(50, Math.max(0, Math.round(n)));
    setMarginPct(clamped);
  }, []);

  const chartRows = useMemo((): RoiChartRow[] => {
    const mp = (gmv: number) => marginProfit(gmv, marginPct);
    return mergedMonthlyRows.map((m) => {
      const profit = mp(m.gmv);
      const couponRoi = roiOrNull(profit, m.couponCost);
      const adRoi = roiOrNull(profit, m.adCost);
      const milkrunRoi = roiOrNull(profit, m.milkrunCost);
      const variableTotalRoi = roiOrNull(profit, m.variableCost);
      const totalRoiIncl = roiOrNull(profit, m.totalCost);
      const chartKey = `${m.yearMonth}\u0000${m.season}`;
      const xTickLabel = formatYearMonthShort(m.yearMonth);
      return {
        chartKey,
        xTickLabel,
        yearMonth: m.yearMonth,
        couponRoi,
        adRoi,
        milkrunRoi,
        variableTotalRoi,
        totalRoiIncl,
      };
    });
  }, [mergedMonthlyRows, marginPct]);

  const bestMonthLabel = useMemo(() => {
    let bestYm = "";
    let bestVal = -Infinity;
    for (const r of chartRows) {
      const v = r.totalRoiIncl;
      if (v !== null && Number.isFinite(v) && v > bestVal) {
        bestVal = v;
        bestYm = r.yearMonth;
      }
    }
    if (!bestYm || !Number.isFinite(bestVal) || bestVal === -Infinity) return "—";
    return `${formatYearMonthShort(bestYm)} (${bestVal.toFixed(2)}x)`;
  }, [chartRows]);

  const seasonRoi = useMemo(() => {
    const rows = mergedMonthlyRows.filter((m) => m.season === selectedWindow.season);
    let profit = 0;
    let cost = 0;
    for (const m of rows) {
      profit += marginProfit(m.gmv, marginPct);
      cost += m.totalCost;
    }
    if (cost <= 0) return null;
    return profit / cost;
  }, [mergedMonthlyRows, selectedWindow.season, marginPct]);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">1원 써서 몇 원 벌었나?</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">시즌 범위</span>
        <Select value={seasonWindow} onValueChange={(v) => setSeasonWindow(v as SeasonWindowValue)}>
          <SelectTrigger className="w-[180px]" size="sm">
            <SelectValue placeholder="시즌 선택" />
          </SelectTrigger>
          <SelectContent>
            {SEASON_WINDOW_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">통계 범위: 10월~다음해 3월</span>
      </div>

      {/* 섹션 1: 마진율 입력 */}
      <div className="flex max-w-md flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="roi-margin-input">
          마진율(%)
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="roi-margin-input"
            type="number"
            min={0}
            max={50}
            step={1}
            value={marginPct}
            onChange={(e) => handleMarginInput(e.target.value)}
            className="w-[120px]"
          />
          <span className="text-muted-foreground text-xs">
            기본값: {autoMarginPct}% (실제 데이터 평균)
          </span>
        </div>
      </div>

      {/* 섹션 2: 요약 카드 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard title={`${selectedWindow.season} 평균 ROI`} value={formatRoiX(seasonRoi)} />
        <StatCard title="월 최고 ROI" value={bestMonthLabel} />
      </div>

      {/* 섹션 3: 월별 ROI — 그룹 막대 + 총 ROI 점선 */}
      <ChartContainer title="월별 ROI (마진율 반영)" loading={false}>
        <div className="h-[min(400px,65vw)] min-h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="xTickLabel"
                tick={{ fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                height={48}
              />
              <YAxis
                tickFormatter={(v) => `${Number(v).toFixed(1)}x`}
                width={48}
                tick={{ fontSize: 11 }}
                label={{
                  value: "ROI (배)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" />
              <Tooltip content={(p) => <RoiTooltip {...(p as TooltipProps)} />} />
              <Legend wrapperStyle={{ paddingTop: 12 }} verticalAlign="bottom" />
              <Bar dataKey="couponRoi" name="쿠폰 ROI" fill={COLOR_COUPON} maxBarSize={18} />
              <Bar dataKey="adRoi" name="광고 ROI" fill={COLOR_AD} maxBarSize={18} />
              <Bar dataKey="milkrunRoi" name="밀크런 ROI" fill={COLOR_MILK} maxBarSize={18} />
              <Bar
                dataKey="variableTotalRoi"
                name="총 변동비용 ROI"
                fill={COLOR_VAR}
                maxBarSize={18}
              />
              <Line
                type="monotone"
                dataKey="totalRoiIncl"
                name="총 ROI (프리미엄 포함)"
                stroke={COLOR_TOTAL_LINE}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartContainer>

      {/* 섹션 4: 프리미엄 주석 */}
      <div className="bg-muted/50 text-muted-foreground border-border/60 rounded-lg border px-4 py-3 text-sm leading-relaxed">
        <p>
          💡{" "}
          <span className="text-foreground font-semibold">
            프리미엄 데이터 구독료(월 165만원)는 고정비로 월별 ROI 막대에서 제외했습니다.
          </span>
        </p>
        <p className="mt-1">총 ROI(점선)만 프리미엄 포함 기준으로 표시됩니다.</p>
      </div>
    </div>
  );
}
