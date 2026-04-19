"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

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
          <CardDescription>
            막대: orders 기준 일별 입고·출고 수량 · 선: 현재 총재고에서 역산한 일말 재고 추이(참고)
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted/40 flex rounded-lg border p-0.5">
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
                className="h-8"
                onClick={() => setPreset("custom")}
              >
                <CalendarDays className="mr-1 h-4 w-4" />
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
        <p className="text-muted-foreground mb-2 text-xs">
          기간 {rangeFrom} ~ {rangeTo}
        </p>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm">표시할 기간 데이터가 없습니다.</p>
        ) : (
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  width={36}
                  label={{ value: "입·출고", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  width={44}
                  label={{ value: "재고(우)", angle: 90, position: "insideRight", fontSize: 10 }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as { date?: string };
                    const labels: Record<string, string> = {
                      inbound: "입고량",
                      outbound: "출고량",
                      stockEnd: "재고(일말·우축)",
                    };
                    return (
                      <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{row.date ?? String(label)}</p>
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
                  fill="#378ADD"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="outbound"
                  name="outbound"
                  fill="#D85A30"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="stockEnd"
                  name="stockEnd"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: "#16a34a" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
