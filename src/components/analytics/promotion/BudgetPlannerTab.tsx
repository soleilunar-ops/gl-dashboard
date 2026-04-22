"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { calcRecommendedTiming } from "@/components/analytics/promotion/_utils/calcRecommendedTiming";
import { usePromotion } from "@/components/analytics/promotion/_hooks/usePromotion";
import { cn } from "@/lib/utils";
import type { Column } from "@/types/shared";

export type TabProps = {
  data: NonNullable<ReturnType<typeof usePromotion>["data"]>;
};

const DEFAULT_TARGET = 5_000_000_000;
const PREMIUM_MONTHLY_FIXED = 1_650_000;
const OCT_TO_MAR_INDICES = [2, 3, 4, 5, 6, 7] as const;

const MONTH_LABEL: Record<number, string> = {
  1: "9월",
  2: "10월",
  3: "11월",
  4: "12월",
  5: "1월",
  6: "2월",
  7: "3월",
};

/** 오늘 기준 yearMonth */
function todayYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** baseline 시즌 총 변동비용 */
function seasonTotalVariable(monthly: TabProps["data"]["monthly"], season: string): number {
  return monthly
    .filter((m) => m.season === season && m.isBaseline)
    .reduce((sum, m) => sum + m.variableCost, 0);
}

/** baseline 시즌·시즌월 인덱스에 해당하는 월 행 */
function monthRowBaseline(
  monthly: TabProps["data"]["monthly"],
  season: string,
  smIdx: number
): { couponCost: number; adCost: number; milkrunCost: number } | undefined {
  // 변경 이유: 같은 달 엑셀 추가 시 첫 행만 쓰지 않도록 baseline 월 데이터를 seasonMonthIndex 기준으로 합산합니다.
  const rows = monthly.filter(
    (m) => m.season === season && m.isBaseline && m.seasonMonthIndex === smIdx
  );
  if (!rows.length) return undefined;
  return rows.reduce(
    (acc, row) => {
      acc.couponCost += row.couponCost;
      acc.adCost += row.adCost;
      acc.milkrunCost += row.milkrunCost;
      return acc;
    },
    { couponCost: 0, adCost: 0, milkrunCost: 0 }
  );
}

function fmtKrw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 채널별 월 비중(단일 기준 시즌) */
function channelShare(
  data: TabProps["data"],
  smIdx: number,
  channel: "coupon" | "ad" | "milkrun",
  baselineSeason: string
): number {
  const totalVariable = seasonTotalVariable(data.monthly, baselineSeason);
  if (totalVariable <= 0) return 0;
  const row = monthRowBaseline(data.monthly, baselineSeason, smIdx);
  if (!row) return 0;
  const channelCost =
    channel === "coupon" ? row.couponCost : channel === "ad" ? row.adCost : row.milkrunCost;
  return channelCost / totalVariable;
}

/** 진행 중 시즌 live: 해당 시즌월이 이미 지난 경우에만 variableCost 합계 */
function liveVariableActual(data: TabProps["data"], seasonMonthIndex: number): number | null {
  const cs = data.currentSeason;
  if (!cs) return null;
  const cap = todayYm();
  const rows = data.monthly.filter(
    (m) =>
      !m.isBaseline &&
      m.season === cs &&
      m.seasonMonthIndex === seasonMonthIndex &&
      m.yearMonth <= cap
  );
  if (!rows.length) return null;
  return rows.reduce((s, m) => s + m.variableCost, 0);
}

type BudgetRow = {
  monthLabel: string;
  seasonMonthIndex: number;
  couponBudget: number;
  adBudget: number;
  milkrunBudget: number;
  premiumBudget: number;
  timing: string;
  rowTotal: number;
  actualVariable: number | null;
  progressPct: number | null;
};

function progressCellClass(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  if (pct < 50 || pct > 150) return "bg-red-600/15 text-foreground";
  if (pct >= 80 && pct <= 120) return "bg-green-600/15 text-foreground";
  if ((pct > 120 && pct <= 150) || (pct >= 50 && pct < 80))
    return "bg-amber-400/25 text-foreground";
  return "";
}

export default function BudgetPlannerTab({ data }: TabProps) {
  const baselineSeason = useMemo(() => {
    if (data.closedSeasons.length > 0) return data.closedSeasons[0];
    const fallback = [
      ...new Set(data.monthly.filter((m) => m.isBaseline).map((m) => m.season)),
    ].sort();
    return fallback[fallback.length - 1] ?? "25시즌";
  }, [data.closedSeasons, data.monthly]);

  const [targetRevenue, setTargetRevenue] = useState(DEFAULT_TARGET);
  const [costTenth, setCostTenth] = useState(0);
  const [costUserTouched, setCostUserTouched] = useState(false);
  const [marginInput, setMarginInput] = useState("");
  const [savedMarginPct, setSavedMarginPct] = useState(0);

  const autoCost = useMemo(() => {
    const s = data.seasonSummary[baselineSeason];
    const pct = (s?.costRatio ?? 0) * 100;
    const tenth = Math.round(pct * 10);
    return Math.min(250, Math.max(0, tenth));
  }, [data.seasonSummary, baselineSeason]);

  useEffect(() => {
    if (!costUserTouched) {
      setCostTenth(autoCost);
    }
  }, [autoCost, costUserTouched]);

  const defaultMarginPct = useMemo(() => {
    const totals = data.monthly.reduce(
      (acc, row) => {
        acc.gmv += row.gmv;
        acc.cogs += row.cogs;
        return acc;
      },
      { gmv: 0, cogs: 0 }
    );
    if (totals.gmv <= 0) return 0;
    return ((totals.gmv - totals.cogs) / totals.gmv) * 100;
  }, [data.monthly]);

  useEffect(() => {
    setMarginInput(defaultMarginPct.toFixed(1));
    setSavedMarginPct(defaultMarginPct);
  }, [defaultMarginPct]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = Number(marginInput);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.min(100, Math.max(0, parsed));
      setSavedMarginPct(clamped);
    }, 300);
    return () => clearTimeout(timer);
  }, [marginInput]);

  const costDecimal = costTenth / 1000;

  const tableRows = useMemo((): BudgetRow[] => {
    return OCT_TO_MAR_INDICES.map((smIdx) => {
      const sc = channelShare(data, smIdx, "coupon", baselineSeason);
      const sa = channelShare(data, smIdx, "ad", baselineSeason);
      const sm = channelShare(data, smIdx, "milkrun", baselineSeason);
      const couponBudget = targetRevenue * costDecimal * sc;
      const adBudget = targetRevenue * costDecimal * sa;
      const milkrunBudget = targetRevenue * costDecimal * sm;
      const premiumBudget = PREMIUM_MONTHLY_FIXED;
      const rowTotal = couponBudget + adBudget + milkrunBudget + premiumBudget;
      const actualVariable = liveVariableActual(data, smIdx);
      const progressPct =
        actualVariable !== null && rowTotal > 0 && Number.isFinite(actualVariable / rowTotal)
          ? (actualVariable / rowTotal) * 100
          : null;
      return {
        monthLabel: MONTH_LABEL[smIdx] ?? `${smIdx}월`,
        seasonMonthIndex: smIdx,
        couponBudget,
        adBudget,
        milkrunBudget,
        premiumBudget,
        timing: calcRecommendedTiming(data.couponContracts, smIdx),
        rowTotal,
        actualVariable,
        progressPct,
      };
    });
  }, [data, costDecimal, targetRevenue, baselineSeason]);

  const summary = useMemo(() => {
    const plan = tableRows.reduce((s, r) => s + r.rowTotal, 0);
    const actuals = tableRows
      .map((r) => r.actualVariable)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const actualSum = actuals.reduce((s, v) => s + v, 0);
    return { plan, actualSum, diff: actualSum - plan };
  }, [tableRows]);

  const handleReset = () => {
    setTargetRevenue(DEFAULT_TARGET);
    setCostUserTouched(false);
    setMarginInput(defaultMarginPct.toFixed(1));
  };

  const columns: Column<BudgetRow>[] = useMemo(
    () => [
      { key: "monthLabel", label: "월" },
      { key: "couponBudget", label: "쿠폰예산", render: (_v, row) => fmtKrw(row.couponBudget) },
      { key: "adBudget", label: "광고예산", render: (_v, row) => fmtKrw(row.adBudget) },
      { key: "milkrunBudget", label: "밀크런예산", render: (_v, row) => fmtKrw(row.milkrunBudget) },
      {
        key: "premiumBudget",
        label: "프리미엄예산",
        render: (_v, row) => fmtKrw(row.premiumBudget),
      },
      { key: "timing", label: "권장 타이밍" },
      {
        key: "rowTotal",
        label: "계획 합계",
        render: (_v, row) => fmtKrw(row.rowTotal),
      },
      {
        key: "actualVariable",
        label: "실집행 (진행 중인 시즌만)",
        render: (_v, row) => (row.actualVariable !== null ? fmtKrw(row.actualVariable) : "—"),
      },
      {
        key: "progressPct",
        label: "진행률",
        render: (_v, row) => (
          <div
            className={cn("rounded-md px-2 py-1 font-medium", progressCellClass(row.progressPct))}
          >
            {row.progressPct !== null && Number.isFinite(row.progressPct)
              ? `${row.progressPct.toFixed(1)}%`
              : "—"}
          </div>
        ),
      },
    ],
    []
  );

  const costPctLabel = (costTenth / 10).toFixed(1);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">목표 매출을 찍으려면 월별로 얼마씩 써야 하나?</p>

      {/* 섹션 1: 상단 컨트롤 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
        <div className="space-y-2">
          <p className="text-sm font-medium">기준 시즌</p>
          <p className="text-muted-foreground text-sm">{baselineSeason} (종료 시즌 최신 기준)</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="target-revenue">
            목표 매출 (원)
          </label>
          <Input
            id="target-revenue"
            type="number"
            min={0}
            step={1_000_000}
            value={Number.isFinite(targetRevenue) ? targetRevenue : 0}
            onChange={(e) => setTargetRevenue(Number(e.target.value) || 0)}
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">비용률 {costPctLabel}% (0~25%, 0.1% 단위)</p>
          <Slider
            min={0}
            max={250}
            step={1}
            value={[costTenth]}
            onValueChange={(v) => {
              setCostUserTouched(true);
              setCostTenth(v[0] ?? 0);
            }}
            aria-label="비용률"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="margin-rate">
            마진율 (저장용)
          </label>
          <div className="relative">
            <Input
              id="margin-rate"
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="예: 30"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              className="pr-8"
            />
            <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
              %
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            입력 후 300ms 뒤 저장, 예산 계산에는 사용하지 않습니다.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleReset}
          >
            초기화
          </Button>
        </div>
      </div>

      <DataTable<BudgetRow> columns={columns} data={tableRows} emptyMessage="행이 없습니다." />

      <div className="bg-muted/40 text-muted-foreground rounded-lg border px-4 py-3 text-sm">
        <p>
          <span className="text-foreground font-medium">시즌 전체 계획 합계:</span>{" "}
          {fmtKrw(summary.plan)}
        </p>
        <p className="mt-1">
          <span className="text-foreground font-medium">실집행 합계 (변동비·해당 월만):</span>{" "}
          {fmtKrw(summary.actualSum)}
        </p>
        <p className="mt-1">
          <span className="text-foreground font-medium">차이 (실집행 − 계획):</span>{" "}
          {fmtKrw(summary.diff)}
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        월별 예산(쿠폰·광고·밀크런) = 목표매출 × 비용률 × {baselineSeason} 월별 채널비중.
        프리미엄예산은 월 1,650,000원 고정(10월~3월 6개월 9,900,000원)이며, 현재 저장 마진율은{" "}
        {savedMarginPct.toFixed(1)}% 입니다.
      </p>
    </div>
  );
}
