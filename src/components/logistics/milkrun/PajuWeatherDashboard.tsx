// 변경 이유: 기상청 예보 + 재작업일 + 중국 연휴(코드 내장만, Supabase 수동 편집 없음)를 한 화면에 둡니다.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBuiltinCnHolidayPeriodsForYears } from "@/lib/cn-official-holidays-builtin";
import type { CnHolidayPeriod } from "@/lib/cn-holiday-period";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DailyWeather, WeatherWarningCode } from "@/lib/kma-daily-weather";
import { todayKstYmdDash } from "@/lib/kma-time";
import MilkrunWeatherTab from "@/components/logistics/milkrun/MilkrunWeatherTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ForecastDayRow = {
  date: string;
  offsetDays: number;
  data: DailyWeather;
};

type ForecastPayload = {
  locationLabel: string;
  horizonDays: number;
  note: string;
  generatedAt: string;
  days: ForecastDayRow[];
};

type EnrichedHolidayPeriod = {
  labelKo: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  source: "nager" | "nager+claude" | "cn-builtin";
  substituteWorkdays: string[];
  orderCutoffRecommended: string | null;
  note: string | null;
};

type CnHolidayPayload = {
  year: number;
  verifier: string;
  verifyError?: string | null;
  periods: EnrichedHolidayPeriod[];
};

const WARNING_LABEL: Record<WeatherWarningCode, string> = {
  우천주의: "우천",
  강풍주의: "강풍",
  한파주의: "한파",
  폭염주의: "폭염",
};

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ko-KR");
}

function dDayFromToday(ymd: string): string {
  const today = todayKstYmdDash();
  const d = differenceInCalendarDays(
    parseISO(`${ymd}T12:00:00+09:00`),
    parseISO(`${today}T12:00:00+09:00`)
  );
  if (d === 0) return "D-Day";
  if (d > 0) return `D-${d}`;
  return `D+${Math.abs(d)}`;
}

/** 연휴 시작일 기준 D-day 또는 이미 시작했으면 안내 */
function periodCountdown(startYmd: string, endYmd: string): string {
  const today = todayKstYmdDash();
  if (today >= startYmd && today <= endYmd) return "연휴 중";
  return dDayFromToday(startYmd);
}

export default function PajuWeatherDashboard() {
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [errForecast, setErrForecast] = useState<string | null>(null);
  const [holidayPayload, setHolidayPayload] = useState<CnHolidayPayload | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [holidayLoading, setHolidayLoading] = useState(true);
  /** 출고일(재작업 카드와 11일 예보 카드 강조를 공유) */
  const [orderDate, setOrderDate] = useState(() => todayKstYmdDash());
  /** 예보 슬라이드 시프트 — 0 기본, 좌우 화살표로 ±1씩 이동 */
  const [forecastShift, setForecastShift] = useState(0);

  const yearsToLoad = useMemo(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    return m >= 11 ? [y, y + 1] : [y];
  }, []);

  const builtinPeriods = useMemo(
    () => getBuiltinCnHolidayPeriodsForYears(yearsToLoad),
    [yearsToLoad]
  );

  const fallbackHolidayPeriods: CnHolidayPeriod[] = useMemo(() => {
    const todayYmd = todayKstYmdDash();
    return builtinPeriods.filter((p) => p.endDate >= todayYmd);
  }, [builtinPeriods]);

  const holidayPeriods: EnrichedHolidayPeriod[] = useMemo(() => {
    const todayYmd = todayKstYmdDash();
    if (holidayPayload?.periods?.length) {
      return holidayPayload.periods.filter((p) => p.endDate >= todayYmd);
    }
    return fallbackHolidayPeriods.map((p) => ({
      labelKo: p.labelKo,
      startDate: p.startDate,
      endDate: p.endDate,
      dayCount: p.dayCount,
      source: "cn-builtin",
      substituteWorkdays: p.bridgeDays,
      orderCutoffRecommended: format(
        addDays(parseISO(`${p.startDate}T12:00:00Z`), -14),
        "yyyy-MM-dd"
      ),
      note: "국무원 일정 기반 내장 데이터(오프라인)",
    }));
  }, [holidayPayload, fallbackHolidayPeriods]);

  const loadForecast = useCallback(async () => {
    setForecastLoading(true);
    setErrForecast(null);
    try {
      const fr = await fetch("/api/weather/forecast");
      if (fr.ok) {
        const j = (await fr.json()) as ForecastPayload & { message?: string };
        setForecast(j);
      } else {
        const j = (await fr.json()) as { message?: string };
        setErrForecast(j.message ?? "예보를 불러오지 못했습니다.");
        setForecast(null);
      }
    } catch {
      setErrForecast("네트워크 오류");
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const loadCnHolidays = useCallback(async () => {
    setHolidayLoading(true);
    setHolidayError(null);
    try {
      const currentYear = new Date().getFullYear();
      const res = await fetch(`/api/holidays/cn/enriched?year=${currentYear}`);
      if (!res.ok) {
        const json = (await res.json()) as { message?: string };
        setHolidayPayload(null);
        setHolidayError(json.message ?? "중국 연휴 데이터를 불러오지 못했습니다.");
        return;
      }
      const json = (await res.json()) as CnHolidayPayload;
      if (!Array.isArray(json.periods) || typeof json.verifier !== "string") {
        setHolidayPayload(null);
        setHolidayError("중국 연휴 API 응답 형식이 올바르지 않습니다.");
        return;
      }
      setHolidayPayload(json);
    } catch {
      setHolidayPayload(null);
      setHolidayError("중국 연휴 데이터를 불러오지 못했습니다.");
    } finally {
      setHolidayLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForecast();
    void loadCnHolidays();
  }, [loadForecast, loadCnHolidays]);

  return (
    <Tabs defaultValue="weather" className="gap-6">
      <TabsList>
        <TabsTrigger value="weather">출고 관련 날씨</TabsTrigger>
        <TabsTrigger value="holidays">중국 연휴 일정</TabsTrigger>
      </TabsList>

      <TabsContent value="weather" className="space-y-8">
        <MilkrunWeatherTab orderDate={orderDate} onOrderDateChange={setOrderDate} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {forecastLoading
                ? "파주 일별 예보"
                : `파주 일별 예보 (${forecast?.horizonDays ?? "—"}일)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {errForecast && <p className="text-destructive text-sm">{errForecast}</p>}
            {forecastLoading && !forecast ? (
              <div className="flex gap-2">
                {Array.from({ length: 11 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 flex-1 rounded-lg" />
                ))}
              </div>
            ) : forecast && forecast.days.length > 0 ? (
              (() => {
                const days = forecast.days;
                const total = days.length;
                // 11일 기준: 중앙 5일 선명, 양쪽 3일씩 반투명 — shift로 좌우 이동 가능
                const baseCenter = Math.floor(total / 2);
                const clearCenter = Math.max(2, Math.min(total - 3, baseCenter + forecastShift));
                const clearStart = clearCenter - 2;
                const clearEnd = clearCenter + 2;
                const minShift = -Math.min(3, baseCenter - 2);
                const maxShift = Math.min(3, total - 3 - baseCenter);
                const canLeft = forecastShift > minShift;
                const canRight = forecastShift < maxShift;
                return (
                  <div className="flex items-stretch gap-2">
                    {/* 왼쪽 화살표 */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!canLeft}
                      onClick={() => setForecastShift((v) => Math.max(minShift, v - 1))}
                      aria-label="이전"
                      className="h-auto shrink-0 self-stretch"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>

                    {/* 카드 목록 — 중앙 5일 선명, 나머지 반투명 */}
                    <div className="flex flex-1 gap-2">
                      {days.map((row, idx) => {
                        const w = row.data;
                        const wd = format(parseISO(`${row.date}T12:00:00+09:00`), "M/d (EEE)", {
                          locale: ko,
                        });
                        const inCenter = idx >= clearStart && idx <= clearEnd;
                        return (
                          <div
                            key={row.date}
                            className={cn(
                              "bg-card flex min-w-0 flex-1 flex-col items-center justify-between gap-2 rounded-lg border p-3 text-center text-sm shadow-sm transition-opacity duration-300",
                              !inCenter && "opacity-40"
                            )}
                          >
                            {/* 날짜 (굵게) + 경고 배지 */}
                            <div className="flex w-full items-center justify-center gap-1.5">
                              <span className="text-foreground text-xs font-bold">{wd}</span>
                              {w.warnings.length > 0 ? (
                                <div className="flex flex-wrap justify-center gap-1">
                                  {w.warnings.map((c) => (
                                    <Badge
                                      key={c}
                                      variant="destructive"
                                      className="px-1 py-0 text-[10px]"
                                    >
                                      {WARNING_LABEL[c]}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {/* 이모지 + 요약 */}
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-2xl leading-none">{w.emoji}</span>
                              <span className="line-clamp-2 text-xs leading-tight">
                                {w.summaryKo}
                              </span>
                            </div>
                            {/* 기온/강수 */}
                            <div className="flex flex-col items-center gap-0.5">
                              <p className="text-xs [font-variant-numeric:tabular-nums]">
                                {formatInt(w.tmin)}° / {formatInt(w.tmax)}°
                              </p>
                              <p className="text-muted-foreground text-xs [font-variant-numeric:tabular-nums]">
                                강수 {formatInt(w.popMax)}%
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 오른쪽 화살표 */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!canRight}
                      onClick={() => setForecastShift((v) => Math.min(maxShift, v + 1))}
                      aria-label="다음"
                      className="h-auto shrink-0 self-stretch"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                );
              })()
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="holidays">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">중국 연휴 기간</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {holidayLoading && (
              <p className="text-muted-foreground text-xs">
                중국 공휴일 AI 검증 데이터를 불러오는 중...
              </p>
            )}
            {holidayError && <p className="text-destructive text-xs">{holidayError}</p>}
            {holidayPeriods.length === 0 ? (
              <p className="text-muted-foreground">
                표시할 연휴가 없습니다. 해당 연도 내장 일정이 있으면 여기에 나옵니다.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {holidayPeriods.map((p) => (
                  <li
                    key={`${p.labelKo}-${p.startDate}-${p.endDate}`}
                    className="flex flex-col items-center rounded-md border px-3 py-3 text-center"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-medium">{p.labelKo}</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {periodCountdown(p.startDate, p.endDate)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-xs [font-variant-numeric:tabular-nums]">
                      {p.startDate} ~ {p.endDate} · {p.dayCount}일
                      {p.substituteWorkdays.length > 0 ? (
                        <span
                          className="ml-1"
                          title={`대체근무일: ${p.substituteWorkdays.join(", ")}`}
                        >
                          (대체근무일 포함)
                        </span>
                      ) : null}
                    </p>
                    {p.orderCutoffRecommended && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        발주 마감 권장일: {p.orderCutoffRecommended}
                      </p>
                    )}
                    {p.note && <p className="text-muted-foreground mt-1 text-xs">{p.note}</p>}
                  </li>
                ))}
              </ul>
            )}
            {!holidayLoading && !holidayPayload && (
              <p className="text-[11px] text-amber-600">
                현재는 AI 검증 데이터가 없어 내장 데이터로 표시 중입니다.
              </p>
            )}
            {holidayPayload?.verifyError && (
              <p className="text-[11px] text-amber-600">
                AI 검증 미적용 사유: {holidayPayload.verifyError}
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
