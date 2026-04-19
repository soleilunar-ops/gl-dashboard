"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "@/components/shared/StatCard";
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

type SeasonMeta = TabProps["data"]["seasonConfigs"][number];

type ChartPoint = {
  monthIndex: number;
  label: string;
  ratioActual: number | null;
  ratioForecast: number | null;
  isFinalPoint: boolean;
};

type TooltipRowProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  label?: string | number;
};

function latestBaselineSeasonKey(seasonSummary: TabProps["data"]["seasonSummary"]): string | null {
  const keys = Object.keys(seasonSummary).filter((k) => seasonSummary[k]?.isBaseline);
  if (!keys.length) return null;
  keys.sort((a, b) => {
    const na = parseInt(/\d+/.exec(a)?.[0] ?? "0", 10);
    const nb = parseInt(/\d+/.exec(b)?.[0] ?? "0", 10);
    return nb - na;
  });
  return keys[0];
}

function toYearMonth(dateIso: string): string {
  return dateIso.slice(0, 7);
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function seasonMonths(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out: string[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endM) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur = addMonths(cur, 1);
  }
  return out;
}

function formatSeasonOption(meta: SeasonMeta): string {
  const marker = meta.isClosed ? "● 완료" : "○ 진행 중";
  return `${meta.season} (${meta.startDate} ~ ${meta.endDate}) ${marker}`;
}

function ratioText(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

function wonText(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}

function RatioTooltip({ active, payload, label }: TooltipRowProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartPoint | undefined;
  if (!row) return null;
  return (
    <div className="bg-background border-border rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <ul className="text-muted-foreground space-y-0.5">
        <li>누적(실측): {ratioText(row.ratioActual)}</li>
        <li>누적(예상): {ratioText(row.ratioForecast)}</li>
      </ul>
    </div>
  );
}

function CumulativeDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  isClosedSeason: boolean;
}) {
  const { cx, cy, payload, isClosedSeason } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  if (isClosedSeason && payload.isFinalPoint && payload.ratioActual !== null) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill="#2563eb" stroke="#fff" strokeWidth={1} />
        <text x={cx} y={cy - 12} fill="#1e40af" fontSize={10} textAnchor="middle">
          {`최종 ${payload.ratioActual.toFixed(2)}%`}
        </text>
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={3} fill="#2563eb" stroke="#fff" strokeWidth={1} />;
}

export default function SeasonAlertTab({ data }: TabProps) {
  const todayYm = toYearMonth(new Date().toISOString().slice(0, 10));
  const seasonOptions = useMemo(() => {
    return [...data.seasonConfigs].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
  }, [data.seasonConfigs]);

  const defaultSeason = useMemo(() => {
    const open = seasonOptions.find((s) => s.isClosed === false);
    if (open) return open.season;
    return seasonOptions[0]?.season ?? "";
  }, [seasonOptions]);

  const [selectedSeason, setSelectedSeason] = useState(defaultSeason);

  useEffect(() => {
    setSelectedSeason(defaultSeason);
  }, [defaultSeason]);

  const selectedSeasonMeta = useMemo(
    () => seasonOptions.find((s) => s.season === selectedSeason) ?? null,
    [seasonOptions, selectedSeason]
  );

  const isClosedSeason = selectedSeasonMeta?.isClosed ?? false;

  const latestBaselineKey = useMemo(
    () => latestBaselineSeasonKey(data.seasonSummary),
    [data.seasonSummary]
  );
  const { firstWarnDec, firstWarnPct, secondRefPct } = useMemo(() => {
    const key = latestBaselineKey ?? "24시즌";
    const snap = data.seasonSummary[key];
    const first =
      snap?.costRatio != null && Number.isFinite(snap.costRatio) ? snap.costRatio : 0.1557;
    const second = first * 0.95;
    return {
      firstWarnDec: first,
      firstWarnPct: first * 100,
      secondRefPct: second * 100,
    };
  }, [data.seasonSummary, latestBaselineKey]);

  const monthAxis = useMemo(() => {
    if (!selectedSeasonMeta) return [] as { ym: string; label: string; monthIndex: number }[];
    const yms = seasonMonths(selectedSeasonMeta.startDate, selectedSeasonMeta.endDate).filter(
      (ym) => {
        const m = Number(ym.slice(5, 7));
        return m === 10 || m === 11 || m === 12 || m === 1 || m === 2 || m === 3;
      }
    );
    return yms.map((ym, idx) => ({
      ym,
      monthIndex: idx + 1,
      label: `${Number(ym.slice(5, 7))}월`,
    }));
  }, [selectedSeasonMeta]);

  const seasonRows = useMemo(() => {
    if (!selectedSeasonMeta) return [];
    const all = data.monthly.filter((m) => m.season === selectedSeasonMeta.season);
    const live = all.filter((m) => !m.isBaseline);
    const source = live.length > 0 ? live : all;
    // 변경 이유: 동일 yearMonth 데이터가 누적 업로드될 때 마지막 한 건만 남지 않도록 월별 합산합니다.
    const byYm = new Map<string, { gmv: number; variableCost: number }>();
    for (const row of source) {
      const prev = byYm.get(row.yearMonth);
      if (!prev) {
        byYm.set(row.yearMonth, { gmv: row.gmv, variableCost: row.variableCost });
        continue;
      }
      prev.gmv += row.gmv;
      prev.variableCost += row.variableCost;
    }

    return monthAxis.map((m) => {
      const row = byYm.get(m.ym);
      return {
        ym: m.ym,
        monthIndex: m.monthIndex,
        label: m.label,
        gmv: row?.gmv ?? 0,
        variableCost: row?.variableCost ?? 0,
      };
    });
  }, [data.monthly, selectedSeasonMeta, monthAxis]);

  const chartPoints = useMemo((): ChartPoint[] => {
    const cumulative = (maxIdx: number) => {
      let g = 0;
      let c = 0;
      for (const row of seasonRows) {
        if (row.monthIndex <= maxIdx) {
          g += row.gmv;
          c += row.variableCost;
        }
      }
      return { g, c, r: g > 0 ? (c / g) * 100 : (null as number | null) };
    };

    const lastLiveIdx = seasonRows
      .filter((r) => r.ym <= todayYm && (r.gmv > 0 || r.variableCost > 0))
      .map((r) => r.monthIndex);
    const lastActual = isClosedSeason
      ? seasonRows.length
      : lastLiveIdx.length
        ? Math.max(...lastLiveIdx)
        : 1;
    const atLast = cumulative(lastActual);
    const gLast = atLast.g;
    const cLast = atLast.c;
    const elapsedRows = seasonRows.filter(
      (r) => r.monthIndex <= lastActual && (r.gmv > 0 || r.variableCost > 0)
    );
    const elapsedCount = Math.max(1, elapsedRows.length);
    const projectedTotalGmv =
      gLast > 0 ? (gLast / elapsedCount) * Math.max(1, seasonRows.length) : 0;
    const paceRatio = gLast > 0 ? cLast / gLast : 0;

    const points: ChartPoint[] = [];
    for (const row of seasonRows) {
      const cum = cumulative(row.monthIndex);
      const ratioActual = row.monthIndex <= lastActual ? cum.r : null;

      let ratioForecast: number | null = null;
      if (!isClosedSeason) {
        if (row.monthIndex < lastActual) {
          ratioForecast = null;
        } else if (row.monthIndex === lastActual) {
          ratioForecast = ratioActual;
        } else {
          const t = (row.monthIndex - lastActual) / Math.max(1, seasonRows.length - lastActual);
          const gk = gLast + (projectedTotalGmv - gLast) * t;
          const ck = gk * paceRatio;
          ratioForecast = gk > 0 ? (ck / gk) * 100 : null;
        }
      }

      points.push({
        monthIndex: row.monthIndex,
        label: row.label,
        ratioActual,
        ratioForecast,
        isFinalPoint: row.monthIndex === seasonRows.length,
      });
    }
    return points;
  }, [seasonRows, isClosedSeason, todayYm]);

  const totals = useMemo(() => {
    const totalGmv = seasonRows.reduce((s, r) => s + r.gmv, 0);
    const totalVariable = seasonRows.reduce((s, r) => s + r.variableCost, 0);
    const maxIdx = isClosedSeason
      ? seasonRows.length
      : seasonRows
          .filter((r) => r.ym <= todayYm && (r.gmv > 0 || r.variableCost > 0))
          .map((r) => r.monthIndex)
          .reduce((m, cur) => (cur > m ? cur : m), 1);
    const nowGmv = seasonRows.filter((r) => r.monthIndex <= maxIdx).reduce((s, r) => s + r.gmv, 0);
    const nowVar = seasonRows
      .filter((r) => r.monthIndex <= maxIdx)
      .reduce((s, r) => s + r.variableCost, 0);
    return { totalGmv, totalVariable, nowGmv, nowVar, maxIdx };
  }, [seasonRows, isClosedSeason, todayYm]);

  const ratioPct = useMemo(() => {
    const gmv = isClosedSeason ? totals.totalGmv : totals.nowGmv;
    const vc = isClosedSeason ? totals.totalVariable : totals.nowVar;
    if (gmv <= 0) return null;
    return (vc / gmv) * 100;
  }, [isClosedSeason, totals]);

  const projectedTotalGmv = useMemo(() => {
    if (isClosedSeason) return totals.totalGmv;
    const elapsed = seasonRows.filter(
      (r) => r.monthIndex <= totals.maxIdx && (r.gmv > 0 || r.variableCost > 0)
    ).length;
    if (elapsed <= 0) return totals.nowGmv;
    return (totals.nowGmv / elapsed) * Math.max(1, seasonRows.length);
  }, [isClosedSeason, totals, seasonRows]);

  const headroomOrOver = useMemo(() => {
    if (isClosedSeason) {
      if (totals.totalGmv <= 0) return null;
      return totals.totalVariable - totals.totalGmv * firstWarnDec;
    }
    if (projectedTotalGmv <= 0) return null;
    return projectedTotalGmv * firstWarnDec - totals.nowVar;
  }, [isClosedSeason, totals, projectedTotalGmv, firstWarnDec]);

  const seasonSummaryText = useMemo(() => {
    return `총 매출 ${totals.totalGmv.toLocaleString("ko-KR")}원 / 총 비용 ${totals.totalVariable.toLocaleString("ko-KR")}원`;
  }, [totals]);

  const remainText = useMemo(() => {
    if (!selectedSeasonMeta) return "—";
    const end = new Date(selectedSeasonMeta.endDate);
    const now = new Date();
    const remain = Math.max(
      0,
      (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
    );
    return `${toYearMonth(selectedSeasonMeta.endDate)} (잔여 ${remain}개월)`;
  }, [selectedSeasonMeta]);

  const showRedBanner = ratioPct !== null && ratioPct > firstWarnPct;
  const showYellowBanner = !showRedBanner && ratioPct !== null && ratioPct > secondRefPct;

  const signalKind =
    ratioPct === null
      ? "safe"
      : ratioPct > firstWarnPct
        ? "danger"
        : ratioPct > secondRefPct
          ? "warn"
          : "safe";

  const statIcon = (kind: "safe" | "warn" | "danger") => (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs font-medium",
        kind === "safe" && "border-green-600/40 bg-green-600/10 text-green-700",
        kind === "warn" && "border-amber-500/50 bg-amber-400/20 text-amber-900 dark:text-amber-200",
        kind === "danger" && "border-red-600/40 bg-red-600/10 text-red-700"
      )}
    >
      {kind === "safe" ? "안전" : kind === "warn" ? "주의" : "긴급"}
    </span>
  );

  if (!seasonOptions.length || !selectedSeasonMeta) {
    return <p className="text-muted-foreground text-sm">시즌 설정 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">지금 과소비 중인가? 시즌 끝까지 버틸 수 있나?</p>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs whitespace-nowrap">시즌 선택</span>
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-[360px]" size="sm">
            <SelectValue placeholder="시즌 선택" />
          </SelectTrigger>
          <SelectContent>
            {seasonOptions.map((s) => (
              <SelectItem key={s.season} value={s.season}>
                {formatSeasonOption(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showRedBanner && (
        <div
          role="alert"
          className="border-destructive/60 bg-destructive/15 text-destructive rounded-lg border px-4 py-3 text-sm font-medium"
        >
          {isClosedSeason
            ? `이 시즌은 1차 경고선(${firstWarnPct.toFixed(2)}%)을 초과하여 마감했습니다.`
            : `경고: 누적비용률이 1차 경고선(${firstWarnPct.toFixed(2)}%)을 초과했습니다.`}
        </div>
      )}
      {showYellowBanner && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-400/15 px-4 py-3 text-sm font-medium text-amber-950 dark:text-amber-100"
        >
          {isClosedSeason
            ? "이 시즌은 2차 참고선을 넘긴 상태로 마감했습니다."
            : "주의: 2차 참고선 초과"}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">{selectedSeason} 누적비용률 추이</h2>
            <span className="text-muted-foreground text-xs">표시 범위: 10월 ~ 3월</span>
          </div>

          <div className="border-border bg-card text-card-foreground rounded-xl border p-4 shadow-sm">
            <p className="text-muted-foreground mb-2 text-xs">
              {isClosedSeason
                ? "완료 시즌은 실측 누적비용률만 표시합니다. 주황·빨강 점선은 2차·1차 기준선입니다."
                : "실선은 누적비용률(변동비 기준), 점선은 선택 기준월 이후 동일 비용률·GMV 페이스 가정입니다."}
            </p>
            <div className="h-[min(360px,55vw)] min-h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartPoints} margin={{ top: 16, right: 18, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                    width={44}
                    domain={[0, "auto"]}
                    label={{
                      value: "누적 비용률(%)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11 },
                    }}
                  />
                  <Tooltip content={(p) => <RatioTooltip {...(p as TooltipRowProps)} />} />
                  <Legend />
                  <ReferenceLine
                    y={secondRefPct}
                    stroke="#f97316"
                    strokeDasharray="5 5"
                    label={{
                      value: `2차 ${secondRefPct.toFixed(2)}%`,
                      position: "insideTopRight",
                      fill: "#f97316",
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine
                    y={firstWarnPct}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    label={{
                      value: `1차 ${firstWarnPct.toFixed(2)}%`,
                      position: "insideBottomRight",
                      fill: "#ef4444",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ratioActual"
                    name="누적(실측)"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={(dotProps) => (
                      <CumulativeDot {...dotProps} isClosedSeason={isClosedSeason} />
                    )}
                    connectNulls
                  />
                  {!isClosedSeason && (
                    <Line
                      type="monotone"
                      dataKey="ratioForecast"
                      name="누적(예상)"
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div
            className={cn(
              signalKind === "safe" && "[&_p.text-2xl]:text-green-600",
              signalKind === "warn" && "[&_p.text-2xl]:text-amber-600",
              signalKind === "danger" && "[&_p.text-2xl]:text-red-600"
            )}
          >
            <StatCard
              title={isClosedSeason ? "최종 누적비용률" : "현재 누적비용률"}
              value={ratioText(ratioPct)}
              icon={statIcon(signalKind)}
            />
          </div>

          <div
            className={cn(
              headroomOrOver !== null && headroomOrOver > 0 && "[&_p.text-2xl]:text-red-600",
              headroomOrOver !== null && headroomOrOver <= 0 && "[&_p.text-2xl]:text-green-600"
            )}
          >
            <StatCard
              title={isClosedSeason ? "경고선 대비 초과 금액" : "경고선까지 여유 금액"}
              value={wonText(headroomOrOver)}
              icon={
                headroomOrOver === null ? undefined : headroomOrOver > 0 ? (
                  <span className="rounded-md border border-red-600/40 bg-red-600/10 px-2 py-0.5 text-xs text-red-700">
                    초과
                  </span>
                ) : (
                  <span className="rounded-md border border-green-600/40 bg-green-600/10 px-2 py-0.5 text-xs text-green-700">
                    안전
                  </span>
                )
              }
            />
          </div>

          <StatCard
            title={isClosedSeason ? "시즌 요약" : "남은 시즌 기간"}
            value={isClosedSeason ? seasonSummaryText : remainText}
          />
        </div>
      </div>
    </div>
  );
}
