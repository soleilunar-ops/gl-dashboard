"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/** 차트 색상 — 입고(#BBBF4E 올리브), 출고(#A90000 진한 레드), 재고선(#F2BE5C 골드) */
const COLOR_INBOUND = "#BBBF4E";
const COLOR_OUTBOUND = "#A90000";
const COLOR_STOCK = "#F2BE5C";

type Preset = "7d" | "30d" | "custom";

type SeriesPoint = {
  date: string;
  inbound: number;
  outbound: number;
  stockEnd: number;
};

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function formatAxisDate(iso: string): string {
  try {
    return format(new Date(`${iso}T12:00:00`), "M/d", { locale: ko });
  } catch {
    return iso;
  }
}

export function GlWarehouseTrendChart() {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset>("30d");
  const [rangeFrom, setRangeFrom] = useState(() => toYmd(subDays(today, 29)));
  const [rangeTo, setRangeTo] = useState(() => toYmd(today));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    if (p === "7d") {
      setRangeFrom(toYmd(subDays(new Date(), 6)));
      setRangeTo(toYmd(new Date()));
    } else if (p === "30d") {
      setRangeFrom(toYmd(subDays(new Date(), 29)));
      setRangeTo(toYmd(new Date()));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/logistics/gl-daily-series?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
      );
      const json = (await res.json()) as { series?: SeriesPoint[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "차트 데이터를 불러오지 못했습니다.");
        setSeries([]);
        return;
      }
      setSeries(json.series ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      series.map((r) => ({
        ...r,
        label: formatAxisDate(r.date),
      })),
    [series]
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>GL창고 일별 입출고 현황</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 기간 표시 — 7일/30일 버튼과 동일한 글씨 크기·색상 */}
          <span className="text-muted-foreground text-sm">
            기간 {rangeFrom} ~ {rangeTo}
          </span>
          <div className="bg-muted/40 flex items-center gap-1 rounded-lg border p-0.5">
            <Button
              type="button"
              variant={preset === "7d" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-md px-3"
              onClick={() => applyPreset("7d")}
            >
              7일
            </Button>
            <Button
              type="button"
              variant={preset === "30d" ? "default" : "ghost"}
              size="sm"
              className="h-8 rounded-md px-3"
              onClick={() => applyPreset("30d")}
            >
              30일
            </Button>
          </div>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={preset === "custom" ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-md px-3"
                onClick={() => setPreset("custom")}
              >
                기간설정
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={{
                  from: rangeFrom ? new Date(`${rangeFrom}T12:00:00`) : undefined,
                  to: rangeTo ? new Date(`${rangeTo}T12:00:00`) : undefined,
                }}
                onSelect={(r) => {
                  if (r?.from) setRangeFrom(toYmd(r.from));
                  if (r?.to) setRangeTo(toYmd(r.to));
                }}
              />
              <div className="flex justify-end gap-2 border-t p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setCalendarOpen(false)}
                >
                  닫기
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setPreset("custom");
                    setCalendarOpen(false);
                  }}
                >
                  적용
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {/* 좌·우 축 라벨 — 수평 정렬 */}
        <div className="mb-1 flex items-center justify-between px-2 text-xs font-medium text-gray-600">
          <span>입·출고</span>
          <span>재고</span>
        </div>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm">표시할 기간 데이터가 없습니다.</p>
        ) : (
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              {/* left margin 확보 — Y축 라벨 잘림 방지 */}
              <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 12, bottom: 4 }}>
                <defs>
                  <linearGradient id="grad-inbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={COLOR_INBOUND} stopOpacity={0.95} />
                    <stop offset="1" stopColor={COLOR_INBOUND} stopOpacity={0.75} />
                  </linearGradient>
                  <linearGradient id="grad-outbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={COLOR_OUTBOUND} stopOpacity={0.95} />
                    <stop offset="1" stopColor={COLOR_OUTBOUND} stopOpacity={0.75} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#475569" }}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={{ stroke: "#E5E7EB" }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={48}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={56}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as { date?: string };
                    const labels: Record<string, string> = {
                      inbound: "입고량",
                      outbound: "출고량",
                      stockEnd: "일말 재고",
                    };
                    return (
                      <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-lg">
                        <p className="font-bold text-gray-900">{row.date ?? String(label)}</p>
                        <ul className="mt-1 space-y-0.5">
                          {payload.map((p) => {
                            const key = String(p.dataKey ?? "");
                            const v = typeof p.value === "number" ? p.value : Number(p.value);
                            return (
                              <li key={key} className="flex justify-between gap-6 tabular-nums">
                                <span>{labels[key] ?? key}</span>
                                <span>{Number.isFinite(v) ? v.toLocaleString("ko-KR") : "—"}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="inbound"
                  name="inbound"
                  fill="url(#grad-inbound)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                />
                <Bar
                  yAxisId="left"
                  dataKey="outbound"
                  name="outbound"
                  fill="url(#grad-outbound)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="stockEnd"
                  name="stockEnd"
                  stroke={COLOR_STOCK}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COLOR_STOCK, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: COLOR_STOCK, stroke: "#fff", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* 범례 — 아이콘 + 설명 (선/막대 접두어 제거) */}
        {!loading && !error && chartData.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-5 text-xs text-gray-700">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5"
                style={{ backgroundColor: COLOR_STOCK }}
                aria-hidden
              />
              일말 재고 추이
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLOR_INBOUND }}
                aria-hidden
              />
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLOR_OUTBOUND }}
                aria-hidden
              />
              입출고 수량
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
