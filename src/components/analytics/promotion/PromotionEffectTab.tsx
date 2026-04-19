"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "@/components/shared/StatCard";
import ChartContainer from "@/components/shared/ChartContainer";
import { Badge } from "@/components/ui/badge";
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

/** 차트 한 행: 4층 스택 + 라인·테두리용 */
type EffectChartRow = {
  /** X축 고유 키(baseline/live 동월 공존 시 분리) */
  chartKey: string;
  /** X축 표시 라벨 */
  xTickLabel: string;
  yearMonth: string;
  season: string;
  isBaseline: boolean;
  couponCost: number;
  adCost: number;
  milkrunCost: number;
  premiumDataCost: number;
  totalCost: number;
  gmv: number;
  avgTemp: number | null;
  tempAnomaly: number | null;
  /** 월 총비용 / 판매액 (막대 테두리 강조용) */
  costRatio: number | null;
};

const COLOR_COUPON = "#3B82F6";
const COLOR_AD = "#F97316";
const COLOR_MILK = "#10B981";
const COLOR_PREMIUM = "#6B7280";
const COLOR_GMV = "#EF4444";

/** 차트·히트맵 X축 정렬용 (recharts margin.left/right와 동일 px) */
const CHART_SIDE_GUTTER = 56;
const OCT_TO_MAR_MIN_INDEX = 2;
const OCT_TO_MAR_MAX_INDEX = 7;
const SEASON_WINDOW_OPTIONS = [
  // 시즌 라벨(24-25, 25-26)과 실제 season 키(24시즌, 25시즌)를 1:1로 맞춘다.
  { value: "24-25", season: "24시즌", label: "24년 10월 ~ 25년 3월" },
  { value: "25-26", season: "25시즌", label: "25년 10월 ~ 26년 3월" },
] as const;
type SeasonWindowValue = (typeof SEASON_WINDOW_OPTIONS)[number]["value"];

function formatKrw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function formatPct(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function formatPp(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}p`;
}

function yAxisTickKrw(v: number): string {
  if (Math.abs(v) >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (Math.abs(v) >= 10_000) return `${(v / 10_000).toLocaleString("ko-KR")}만`;
  return v.toLocaleString("ko-KR");
}

/** 평년편차(°C) → 히트맵 셀 배경색 (데이터 없음은 평년 구간과 색 분리) */
function getHeatmapColor(anomaly: number | null): string {
  if (anomaly === null || !Number.isFinite(anomaly)) return "#E5E7EB";
  if (anomaly < -2.0) return "#DC2626";
  if (anomaly < -0.5) return "#FCA5A5";
  if (anomaly <= 0.5) return "#9CA3AF";
  if (anomaly <= 2.0) return "#93C5FD";
  return "#2563EB";
}

/** 스택 막대 테두리: baseline 실선, live 점선 */
function stackBorderStyle(
  isBaseline: boolean,
  costRatio: number | null
): { stroke: string; strokeWidth: number; strokeDasharray?: string } {
  const dash = isBaseline ? undefined : "4 3";
  if (costRatio !== null && Number.isFinite(costRatio)) {
    if (costRatio > 0.2) return { stroke: "#EF4444", strokeWidth: 2, strokeDasharray: dash };
    if (costRatio < 0.1) return { stroke: "#10B981", strokeWidth: 2, strokeDasharray: dash };
  }
  return { stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: dash };
}

type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  label?: string | number;
};

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as EffectChartRow | undefined;
  if (!row) return null;

  return (
    <div className="bg-background border-border max-w-xs rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{row.yearMonth}</p>
      <ul className="text-muted-foreground space-y-0.5">
        <li>총비용: {formatKrw(row.totalCost)}</li>
        <li>쿠폰: {formatKrw(row.couponCost)}</li>
        <li>광고비: {formatKrw(row.adCost)}</li>
        <li>밀크런: {formatKrw(row.milkrunCost)}</li>
        <li>프리미엄데이터(고정비): {formatKrw(row.premiumDataCost)}</li>
        <li className="text-foreground font-medium">판매액: {formatKrw(row.gmv)}</li>
      </ul>
    </div>
  );
}

/** 하단 범례: 4채널 + 판매액 + 기온편차 색역 */
function CustomLegend() {
  const items: { color: string; label: string }[] = [
    { color: COLOR_COUPON, label: "쿠폰" },
    { color: COLOR_AD, label: "광고비" },
    { color: COLOR_MILK, label: "밀크런" },
    { color: COLOR_PREMIUM, label: "프리미엄데이터 (고정비)" },
    { color: COLOR_GMV, label: "판매액(원)" },
  ];
  const heatSamples: { color: string; label: string }[] = [
    { color: "#E5E7EB", label: "데이터 없음" },
    { color: "#DC2626", label: "< -2°C" },
    { color: "#FCA5A5", label: "-2~-0.5°C" },
    { color: "#9CA3AF", label: "±0.5°C" },
    { color: "#93C5FD", label: "+0.5~+2°C" },
    { color: "#2563EB", label: "> +2°C" },
  ];

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2 text-xs">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: it.color }}
          />
          {it.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-2">
        <span className="text-foreground font-medium">기온편차</span>
        {heatSamples.map((h) => (
          <span key={h.label} className="inline-flex items-center gap-1">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: h.color }}
            />
            {h.label}
          </span>
        ))}
      </span>
    </div>
  );
}

/** yearMonth "2024-11" → "24.11" */
function formatYearMonthShort(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y.slice(2)}.${m}`;
}

export default function PromotionEffectTab({ data }: TabProps) {
  const [heatHover, setHeatHover] = useState<{
    row: EffectChartRow;
    clientX: number;
    clientY: number;
  } | null>(null);
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

  const chartRows = useMemo((): EffectChartRow[] => {
    // 변경 이유: 같은 연월의 baseline/live가 분리되어 "26.03·live"가 생겨 월 통계가 쪼개지므로 연월 단위로 합산합니다.
    const source = data.monthly.filter(
      (m) =>
        m.seasonMonthIndex >= OCT_TO_MAR_MIN_INDEX &&
        m.seasonMonthIndex <= OCT_TO_MAR_MAX_INDEX &&
        m.season === selectedWindow.season
    );

    const buckets = new Map<
      string,
      {
        yearMonth: string;
        season: string;
        hasLive: boolean;
        couponCost: number;
        adCost: number;
        milkrunCost: number;
        premiumDataCost: number;
        totalCost: number;
        gmv: number;
        avgTemp: number | null;
        tempAnomaly: number | null;
      }
    >();

    for (const m of source) {
      const key = m.yearMonth;
      const prev = buckets.get(key);
      if (!prev) {
        buckets.set(key, {
          yearMonth: m.yearMonth,
          season: m.season,
          hasLive: !m.isBaseline,
          couponCost: m.couponCost,
          adCost: m.adCost,
          milkrunCost: m.milkrunCost,
          premiumDataCost: m.premiumDataCost,
          totalCost: m.totalCost,
          gmv: m.gmv,
          avgTemp: m.avgTemp,
          tempAnomaly: m.tempAnomaly,
        });
        continue;
      }
      prev.hasLive = prev.hasLive || !m.isBaseline;
      prev.couponCost += m.couponCost;
      prev.adCost += m.adCost;
      prev.milkrunCost += m.milkrunCost;
      prev.premiumDataCost += m.premiumDataCost;
      prev.totalCost += m.totalCost;
      prev.gmv += m.gmv;
      // 변경 이유: baseline/live가 같은 달이면 기온·편차는 동일 출처이므로 둘 다 있을 때 평균으로 합칩니다.
      if (
        prev.avgTemp !== null &&
        m.avgTemp !== null &&
        Number.isFinite(prev.avgTemp) &&
        Number.isFinite(m.avgTemp)
      ) {
        prev.avgTemp = (prev.avgTemp + m.avgTemp) / 2;
      } else if (prev.avgTemp === null && m.avgTemp !== null && Number.isFinite(m.avgTemp)) {
        prev.avgTemp = m.avgTemp;
      }
      if (
        prev.tempAnomaly !== null &&
        m.tempAnomaly !== null &&
        Number.isFinite(prev.tempAnomaly) &&
        Number.isFinite(m.tempAnomaly)
      ) {
        prev.tempAnomaly = (prev.tempAnomaly + m.tempAnomaly) / 2;
      } else if (
        prev.tempAnomaly === null &&
        m.tempAnomaly !== null &&
        Number.isFinite(m.tempAnomaly)
      ) {
        prev.tempAnomaly = m.tempAnomaly;
      }
    }

    return [...buckets.values()]
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
      .map((m) => {
        const costRatio =
          m.gmv > 0 && Number.isFinite(m.totalCost / m.gmv) ? m.totalCost / m.gmv : null;
        return {
          chartKey: `${m.yearMonth}\u0000${m.season}`,
          xTickLabel: formatYearMonthShort(m.yearMonth),
          yearMonth: m.yearMonth,
          season: m.season,
          isBaseline: !m.hasLive,
          couponCost: m.couponCost,
          adCost: m.adCost,
          milkrunCost: m.milkrunCost,
          premiumDataCost: m.premiumDataCost,
          totalCost: m.totalCost,
          gmv: m.gmv,
          avgTemp: m.avgTemp,
          tempAnomaly: m.tempAnomaly,
          costRatio,
        };
      });
  }, [data.monthly, selectedWindow.season]);

  const kpi = useMemo(() => {
    const totalGmv = chartRows.reduce((s, r) => s + r.gmv, 0);
    const totalCost = chartRows.reduce((s, r) => s + r.totalCost, 0);
    const costRatioPct = totalGmv > 0 ? (totalCost / totalGmv) * 100 : null;
    return { totalGmv, totalCost, costRatioPct };
  }, [chartRows]);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">돈 쓴 달에 매출이 따라왔나?</p>

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

      {/* 섹션 1: 시즌 KPI — lg 이상 3열 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          title={`총 판매액 (${selectedWindow.label})`}
          value={formatKrw(kpi.totalGmv)}
          icon={
            <Badge variant="outline" className="text-muted-foreground">
              단일 시즌
            </Badge>
          }
        />
        <StatCard
          title="비용률"
          value={formatPct(kpi.costRatioPct)}
          icon={
            <Badge
              variant="outline"
              className={cn(
                kpi.costRatioPct === null && "text-muted-foreground",
                kpi.costRatioPct !== null &&
                  kpi.costRatioPct > 20 &&
                  "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400",
                kpi.costRatioPct !== null &&
                  kpi.costRatioPct <= 20 &&
                  "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400",
                kpi.costRatioPct === 0 && "text-muted-foreground"
              )}
            >
              {kpi.costRatioPct === null ? "N/A" : kpi.costRatioPct > 20 ? "주의" : "양호"}
            </Badge>
          }
        />
        <StatCard
          title={`총비용 (${selectedWindow.label})`}
          value={formatKrw(kpi.totalCost)}
          icon={
            <Badge variant="outline" className="text-muted-foreground">
              단일 시즌
            </Badge>
          }
        />
      </div>

      {/* 섹션 2~3: 메인 차트 + 커스텀 범례 + 기온 히트맵 (동일 좌우 gutter로 X 정렬) */}
      <ChartContainer title="월별 비용(쿠폰·광고·밀크런·프리미엄) vs 판매액" loading={false}>
        <div className="space-y-2">
          <div className="h-[min(420px,70vw)] min-h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartRows}
                margin={{ top: 8, right: CHART_SIDE_GUTTER, left: CHART_SIDE_GUTTER, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="xTickLabel"
                  tick={{ fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={yAxisTickKrw}
                  width={52}
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "비용(원)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    style: { fontSize: 11 },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={yAxisTickKrw}
                  width={52}
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "판매액(원)",
                    angle: 90,
                    position: "insideRight",
                    offset: 10,
                    style: { fontSize: 11 },
                  }}
                />
                <Tooltip content={(props) => <ChartTooltip {...(props as ChartTooltipProps)} />} />
                <Bar
                  yAxisId="left"
                  dataKey="couponCost"
                  name="쿠폰"
                  stackId="cost"
                  fill={COLOR_COUPON}
                >
                  {chartRows.map((entry, i) => {
                    const { stroke, strokeWidth, strokeDasharray } = stackBorderStyle(
                      entry.isBaseline,
                      entry.costRatio
                    );
                    return (
                      <Cell
                        key={`c-${i}`}
                        fillOpacity={1}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                      />
                    );
                  })}
                </Bar>
                <Bar yAxisId="left" dataKey="adCost" name="광고비" stackId="cost" fill={COLOR_AD}>
                  {chartRows.map((entry, i) => {
                    const { stroke, strokeWidth, strokeDasharray } = stackBorderStyle(
                      entry.isBaseline,
                      entry.costRatio
                    );
                    return (
                      <Cell
                        key={`a-${i}`}
                        fillOpacity={1}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                      />
                    );
                  })}
                </Bar>
                <Bar
                  yAxisId="left"
                  dataKey="milkrunCost"
                  name="밀크런"
                  stackId="cost"
                  fill={COLOR_MILK}
                >
                  {chartRows.map((entry, i) => {
                    const { stroke, strokeWidth, strokeDasharray } = stackBorderStyle(
                      entry.isBaseline,
                      entry.costRatio
                    );
                    return (
                      <Cell
                        key={`m-${i}`}
                        fillOpacity={1}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                      />
                    );
                  })}
                </Bar>
                <Bar
                  yAxisId="left"
                  dataKey="premiumDataCost"
                  name="프리미엄데이터 (고정비)"
                  stackId="cost"
                  fill={COLOR_PREMIUM}
                >
                  {chartRows.map((entry, i) => {
                    const { stroke, strokeWidth, strokeDasharray } = stackBorderStyle(
                      entry.isBaseline,
                      entry.costRatio
                    );
                    return (
                      <Cell
                        key={`p-${i}`}
                        fillOpacity={1}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                      />
                    );
                  })}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="gmv"
                  name="판매액(원)"
                  stroke={COLOR_GMV}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <CustomLegend />

          {/* 기온 히트맵: 차트 plot 영역과 동일 좌우 여백으로 월 1:1 정렬 */}
          <div className="relative flex w-full min-w-0">
            <div
              className="text-muted-foreground border-border/60 flex shrink-0 items-center justify-center border-r text-[10px] leading-tight"
              style={{ width: CHART_SIDE_GUTTER, writingMode: "vertical-rl" }}
            >
              기온편차
            </div>
            <div
              className="flex h-8 min-w-0 flex-1"
              style={{ marginRight: CHART_SIDE_GUTTER }}
              onMouseLeave={() => setHeatHover(null)}
            >
              {chartRows.map((row) => (
                <button
                  key={row.chartKey}
                  type="button"
                  aria-label={`${row.yearMonth} 기온편차`}
                  className="hover:ring-primary/40 border-border/40 min-h-[32px] min-w-0 flex-1 border focus:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: getHeatmapColor(row.tempAnomaly) }}
                  onMouseEnter={(e) =>
                    setHeatHover({ row, clientX: e.clientX, clientY: e.clientY })
                  }
                  onMouseMove={(e) => setHeatHover({ row, clientX: e.clientX, clientY: e.clientY })}
                />
              ))}
            </div>
            {heatHover && (
              <div
                className="bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-xs rounded-md border px-2 py-1.5 text-xs shadow-md"
                style={{
                  left: heatHover.clientX + 12,
                  top: heatHover.clientY + 12,
                }}
              >
                {heatHover.row.yearMonth} |{" "}
                {heatHover.row.avgTemp !== null && Number.isFinite(heatHover.row.avgTemp)
                  ? `월평균 ${heatHover.row.avgTemp.toFixed(1)}°C`
                  : "월평균 —"}
                {heatHover.row.tempAnomaly !== null && Number.isFinite(heatHover.row.tempAnomaly)
                  ? ` (평년 대비 ${heatHover.row.tempAnomaly >= 0 ? "+" : ""}${heatHover.row.tempAnomaly.toFixed(1)}°C)`
                  : " (평년 대비 —)"}
              </div>
            )}
          </div>
        </div>
      </ChartContainer>

      {/* 섹션 4: 푸터 */}
      <div className="text-muted-foreground space-y-1 text-xs">
        <p>* 부가세 포함 기준. 쿠팡 SKU 매핑 근사치 포함.</p>
        <p>* 기온편차는 평년(최근 30년 평균) 대비 편차입니다.</p>
      </div>
    </div>
  );
}
