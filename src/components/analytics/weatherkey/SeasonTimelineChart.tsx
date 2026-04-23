"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  Chart as ChartJS,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import annotationPlugin, { type AnnotationOptions } from "chartjs-plugin-annotation";
import zoomPlugin from "chartjs-plugin-zoom";
import "chartjs-adapter-date-fns";
import { Chart } from "react-chartjs-2";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHighlightQuery } from "./_hooks/useHighlightQuery";
import { useSeasonDaily } from "./_hooks/useSeasonDaily";
import { useSeasonStats } from "./_hooks/useSeasonStats";
import { CHART_TOKENS, TEMP_BANDS, tempCategory } from "./_tokens";
import type { SeasonDaily, SeasonStats } from "./_types";

ChartJS.register(
  BarController,
  LineController,
  BarElement,
  PointElement,
  LineElement,
  LinearScale,
  TimeScale,
  Tooltip,
  zoomPlugin,
  annotationPlugin
);

interface Props {
  season: string | null;
}

type DataPoint = { date: Date; temp: number; sales: number };
type EventMarker = { name: string; date: string; featured?: boolean };
type XRange = { min: number; max: number };
type RangePreset = { label: string; range: XRange | null };

function rowsToPoints(rows: SeasonDaily[]): DataPoint[] {
  const out: DataPoint[] = [];
  for (const r of rows) {
    if (!r.date || r.temp_min == null || r.units_sold == null) continue;
    out.push({ date: new Date(r.date), temp: r.temp_min, sales: r.units_sold });
  }
  return out;
}

function deriveEvents(stats: SeasonStats | null): EventMarker[] {
  if (!stats) return [];
  const evs: EventMarker[] = [];
  if (stats.first_sub_10) evs.push({ name: "첫 10℃ 미만", date: stats.first_sub_10 });
  if (stats.first_freeze) evs.push({ name: "첫 영하", date: stats.first_freeze, featured: true });
  if (stats.first_sub_minus_5) evs.push({ name: "첫 −5℃", date: stats.first_sub_minus_5 });
  if (stats.first_arctic)
    evs.push({ name: "첫 혹한(−10℃)", date: stats.first_arctic, featured: true });
  if (stats.peak_date) evs.push({ name: "최고 판매일", date: stats.peak_date, featured: true });
  return evs;
}

function derivePresets(points: DataPoint[]): RangePreset[] {
  if (points.length === 0) return [];
  const last = points[points.length - 1].date;
  const startYear = points[0].date.getFullYear();
  const ts = (iso: string) => new Date(iso).getTime();

  const last30Start = new Date(last);
  last30Start.setDate(last.getDate() - 30);

  return [
    { label: "전체", range: null },
    {
      label: "피크 11–2월",
      range: { min: ts(`${startYear}-11-01`), max: ts(`${startYear + 1}-02-08`) },
    },
    {
      label: "가을 9–11월",
      range: { min: ts(`${startYear}-09-01`), max: ts(`${startYear}-12-01`) },
    },
    {
      label: "겨울 12–2월",
      range: { min: ts(`${startYear}-12-01`), max: ts(`${startYear + 1}-03-01`) },
    },
    { label: "최근 30일", range: { min: last30Start.getTime(), max: last.getTime() } },
  ];
}

/**
 * 메인 시계열 — 판매 bar + 기온 line.
 * 팔레트 A. yTemp는 **역순(reverse=true)** 으로 설정 → 기온이 낮을수록 위로,
 * 판매 bar와 같은 방향으로 움직여 음의 상관이 시각적으로 "같이 오르는" 패턴으로 보임.
 * 트리거 발동일 등 텍스트 정보는 차트 외부(TriggerHistoryPanel)에서 표시.
 */
export default function SeasonTimelineChart({ season }: Props) {
  const { data: daily, loading: dailyLoading, error: dailyError } = useSeasonDaily(season);
  const { data: stats } = useSeasonStats(season);
  const { highlighted, setHighlight } = useHighlightQuery();
  const chartRef = useRef<ChartJS<"bar"> | null>(null);

  const points = useMemo(() => rowsToPoints(daily), [daily]);
  const events = useMemo(() => deriveEvents(stats.current), [stats.current]);
  const presets = useMemo(() => derivePresets(points), [points]);

  const peakWindow = useMemo<XRange | null>(() => {
    if (points.length === 0) return null;
    const startYear = points[0].date.getFullYear();
    return {
      min: new Date(`${startYear}-11-01`).getTime(),
      max: new Date(`${startYear + 1}-02-08`).getTime(),
    };
  }, [points]);

  const [xRange, setXRange] = useState<XRange | null>(null);
  const initialZoomApplied = useRef(false);

  // 시즌 바뀌면 초기 줌 재적용 플래그 리셋
  useEffect(() => {
    initialZoomApplied.current = false;
  }, [season]);

  // points 도착 시 1회만 peakWindow로 초기 줌
  useEffect(() => {
    if (peakWindow && !initialZoomApplied.current) {
      setXRange(peakWindow);
      initialZoomApplied.current = true;
    }
  }, [peakWindow]);

  // 중기예보 경계: 대시보드 기준 날짜 + 1일 이후부터 예보로 간주.
  // 대시보드 당일(판매 실측 마감 전)과 그 다음 날(실측 데이터 존재 가능)까지는 실측으로 취급.
  const forecastCutoff = useMemo(() => {
    const envDate = process.env.NEXT_PUBLIC_DASHBOARD_DATE;
    const base = envDate ?? new Date().toISOString().slice(0, 10);
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + 1); // 대시보드 다음 날까지 실측
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const FORECAST_COLOR = "#F2BE5C"; // 실측 최저기온 선과 동일한 노랑 — 시각 통일

  const chartData = useMemo(() => {
    const barData = points.map((d) => ({ x: d.date.getTime(), y: d.sales }));
    const lineData = points.map((d) => ({ x: d.date.getTime(), y: d.temp }));
    const barColors = points.map((d) => tempCategory(d.temp).color);

    return {
      datasets: [
        {
          type: "bar" as const,
          label: "판매량",
          data: barData,
          backgroundColor: barColors,
          borderWidth: 0,
          yAxisID: "ySales",
          order: 2,
          barPercentage: 0.95,
          categoryPercentage: 1.0,
        },
        {
          type: "line" as const,
          label: "최저기온",
          data: lineData,
          borderColor: CHART_TOKENS.lineTemp,
          backgroundColor: "transparent",
          yAxisID: "yTemp",
          order: 1,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: (ctx: { dataIndex: number }) =>
            points[ctx.dataIndex]?.date.getTime() > forecastCutoff
              ? FORECAST_COLOR
              : CHART_TOKENS.lineTemp,
          borderWidth: 2,
          tension: 0.25,
          // 중기예보 구간(cutoff 이후)은 빨간 실선으로 분리. 실측 데이터로 교체되면 자동으로 기본 색으로 복귀.
          segment: {
            borderColor: (ctx: { p0DataIndex: number; p1DataIndex: number }) => {
              const p1 = points[ctx.p1DataIndex];
              if (p1 && p1.date.getTime() > forecastCutoff) return FORECAST_COLOR;
              return CHART_TOKENS.lineTemp;
            },
            borderDash: (ctx: { p0DataIndex: number; p1DataIndex: number }) => {
              const p1 = points[ctx.p1DataIndex];
              return p1 && p1.date.getTime() > forecastCutoff ? [6, 4] : undefined;
            },
          },
        },
      ],
    } as unknown as ChartData<"bar">;
  }, [points, forecastCutoff]);

  const chartOptions = useMemo<ChartOptions<"bar">>(() => {
    const annotations: Record<string, AnnotationOptions> = {
      zeroLine: {
        type: "line",
        yMin: 0,
        yMax: 0,
        yScaleID: "yTemp",
        borderColor: CHART_TOKENS.zeroLine,
        borderWidth: 1,
        borderDash: [6, 4],
        label: {
          display: true,
          content: "0℃",
          position: "end",
          font: { size: 10 },
          color: CHART_TOKENS.axisTempText,
          backgroundColor: "transparent",
        },
      },
    };

    if (highlighted) {
      const dayStart = new Date(`${highlighted}T00:00:00`).getTime();
      const dayEnd = new Date(`${highlighted}T23:59:59`).getTime();
      annotations["highlight"] = {
        type: "box",
        xMin: dayStart,
        xMax: dayEnd,
        xScaleID: "x",
        backgroundColor: "rgba(43, 109, 163, 0.18)",
        borderColor: "rgba(43, 109, 163, 0.9)",
        borderWidth: 2,
        drawTime: "beforeDatasetsDraw",
      };
    }

    // 중기예보 경계 수직선
    annotations["forecastBoundary"] = {
      type: "line",
      xMin: forecastCutoff,
      xMax: forecastCutoff,
      xScaleID: "x",
      borderColor: FORECAST_COLOR,
      borderWidth: 1.5,
      borderDash: [4, 4],
      label: {
        display: true,
        content: "중기예보 시작",
        position: "start",
        backgroundColor: FORECAST_COLOR,
        color: "#ffffff",
        font: { size: 10, weight: 600 },
        padding: { top: 2, bottom: 2, left: 6, right: 6 },
        borderRadius: 3,
      },
    };

    events.forEach((e, i) => {
      annotations[`event-${i}`] = {
        type: "line",
        xMin: e.date,
        xMax: e.date,
        borderColor: e.featured
          ? CHART_TOKENS.eventMarker.featured
          : CHART_TOKENS.eventMarker.normal,
        borderWidth: e.featured ? 2 : 1.5,
        borderDash: [4, 4],
        label: e.featured
          ? {
              display: true,
              content: e.name,
              position: "start",
              backgroundColor: CHART_TOKENS.eventMarker.label,
              color: "#ffffff",
              font: { size: 11, weight: 600 },
              padding: { top: 3, bottom: 3, left: 7, right: 7 },
              borderRadius: 3,
            }
          : { display: false, content: e.name },
      };
    });

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false, axis: "x" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: CHART_TOKENS.tooltip.bg,
          titleColor: CHART_TOKENS.tooltip.fg,
          bodyColor: CHART_TOKENS.tooltip.subFg,
          borderColor: CHART_TOKENS.tooltip.border,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          titleFont: { size: 13, weight: 500 },
          bodyFont: { size: 12 },
          callbacks: {
            title: (items) => {
              const raw = items[0]?.parsed.x;
              if (raw == null) return "";
              const d = new Date(raw);
              const dn = ["일", "월", "화", "수", "목", "금", "토"];
              return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${dn[d.getDay()]})`;
            },
            label: (item) => {
              const d = points[item.dataIndex];
              if (!d) return "";
              const ds = item.dataset as { type?: string };
              if (ds.type === "line") {
                return `  최저기온: ${d.temp.toFixed(1)}℃ · ${tempCategory(d.temp).label}`;
              }
              return `  판매량: ${d.sales.toLocaleString("ko-KR")}개`;
            },
            afterBody: (items) => {
              const d = points[items[0]?.dataIndex ?? -1];
              if (!d) return [];
              const iso = d.date.toISOString().slice(0, 10);
              const hit = events.find((e) => e.date === iso);
              return hit ? ["", `▶ ${hit.name}`] : [];
            },
          },
        },
        zoom: {
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            drag: {
              enabled: true,
              backgroundColor: CHART_TOKENS.zoomDrag,
              borderColor: CHART_TOKENS.eventMarker.featured,
              borderWidth: 1,
            },
            pinch: { enabled: true },
            mode: "x",
          },
          pan: { enabled: true, mode: "x", modifierKey: "shift" },
        },
        annotation: { annotations },
      },
      scales: {
        x: {
          type: "time",
          min: xRange?.min,
          max: xRange?.max,
          time: {
            unit: "week",
            displayFormats: { week: "M/d", day: "M/d", month: "yyyy. M월" },
          },
          grid: { color: CHART_TOKENS.grid },
          ticks: { font: { size: 11 }, maxTicksLimit: 12 },
        },
        ySales: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          grid: { color: CHART_TOKENS.grid },
          title: { display: true, text: "판매량 (개)", font: { size: 11 } },
          ticks: {
            font: { size: 11 },
            callback: (v) =>
              typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
          },
        },
        yTemp: {
          type: "linear",
          position: "right",
          reverse: true, // 추울수록 위로 — 판매량과 같은 방향으로 움직임
          suggestedMin: -18,
          suggestedMax: 30,
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: "최저기온 (℃, 역순)",
            color: CHART_TOKENS.axisTempText,
            font: { size: 11 },
          },
          ticks: {
            color: CHART_TOKENS.axisTempText,
            font: { size: 11 },
            callback: (v) => `${v}°`,
          },
        },
      },
    };
  }, [events, points, xRange, highlighted, forecastCutoff]);

  const applyRange = (range: XRange | null) => setXRange(range);
  const resetToPeak = () => setXRange(peakWindow);

  if (dailyLoading) {
    return (
      <Card className="h-[560px]">
        <CardContent className="flex h-full flex-col gap-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="w-full flex-1" />
        </CardContent>
      </Card>
    );
  }
  if (dailyError) {
    return (
      <Card className="h-[560px]">
        <CardContent className="text-destructive flex h-full items-center justify-center p-4 text-sm">
          {dailyError}
        </CardContent>
      </Card>
    );
  }
  if (points.length === 0) {
    return (
      <Card className="h-[560px]">
        <CardContent className="text-muted-foreground flex h-full items-center justify-center p-4 text-sm">
          선택한 시즌 데이터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  const isRangeEqual = (a: XRange | null, b: XRange | null) => {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return a.min === b.min && a.max === b.max;
  };

  return (
    <Card className="h-[560px]">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const active = isRangeEqual(p.range, xRange);
              return (
                <Button
                  key={p.label}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyRange(p.range)}
                >
                  {p.label}
                </Button>
              );
            })}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetToPeak}>
              초기화
            </Button>
            {highlighted && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-[color:var(--hotpack-trigger-high)]"
                onClick={() => setHighlight(null)}
              >
                × 하이라이트 해제 ({highlighted})
              </Button>
            )}
          </div>
        )}

        <div className="relative min-h-[240px] flex-1">
          <Chart
            ref={chartRef}
            type="bar"
            data={chartData}
            options={chartOptions}
            aria-label="핫팩 시즌 일별 판매량과 최저기온 시계열"
          />
        </div>

        <div className="text-muted-foreground mt-2 flex flex-wrap justify-center gap-1 pb-1 text-[10px]">
          {TEMP_BANDS.map((b) => (
            <span
              key={b.label}
              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: b.color }}
              />
              {b.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3"
              style={{ backgroundColor: FORECAST_COLOR }}
            />
            중기예보 (실측 교체 시 자동 전환)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
