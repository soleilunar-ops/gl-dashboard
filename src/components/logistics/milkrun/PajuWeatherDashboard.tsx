// 변경 이유: 기상청 예보 + 재작업일 + 중국 연휴(코드 내장만, Supabase 수동 편집 없음)를 한 화면에 둡니다.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBuiltinCnHolidayPeriodsForYears } from "@/lib/cn-official-holidays-builtin";
import type { CnHolidayPeriod } from "@/lib/cn-holiday-period";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { RefreshCw } from "lucide-react";
import type { DailyWeather, WeatherWarningCode } from "@/lib/kma-daily-weather";
import { todayKstYmdDash } from "@/lib/kma-time";
import MilkrunWeatherTab from "@/components/logistics/milkrun/MilkrunWeatherTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadForecast()}
          disabled={forecastLoading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", forecastLoading && "animate-spin")} />
          새로고침
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <h2 className="text-sm font-medium">출고일 기준 재작업일 (D-2 / D-1)</h2>
          <MilkrunWeatherTab />
        </div>

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
            <ul className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {holidayPeriods.length === 0 ? (
                <li className="text-muted-foreground">
                  표시할 연휴가 없습니다. 해당 연도 내장 일정이 있으면 여기에 나옵니다.
                </li>
              ) : (
                holidayPeriods.map((p) => (
                  <li
                    key={`${p.labelKo}-${p.startDate}-${p.endDate}`}
                    className="border-b border-dashed pb-3 last:border-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-medium">{p.labelKo}</span>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {periodCountdown(p.startDate, p.endDate)}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs [font-variant-numeric:tabular-nums]">
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
                ))
              )}
            </ul>
            <p className="text-muted-foreground text-xs">
              Claude 웹 검증이 성공하면 연휴·대체근무일·발주 마감 권장일을 보강합니다. AI를 쓸 수
              없을 때는 국무원 일정 기준 내장 데이터를 표시합니다(Nager 단일일만 쓰지 않음).
            </p>
            {!holidayLoading && !holidayPayload && (
              <p className="text-[11px] text-amber-600">
                현재는 AI 검증 데이터가 없어 내장 데이터로 표시 중입니다.
              </p>
            )}
            {holidayPayload?.verifier && (
              <p className="text-muted-foreground text-[11px]">
                검증 모드: {holidayPayload.verifier}
              </p>
            )}
            {holidayPayload?.verifyError && (
              <p className="text-[11px] text-amber-600">
                AI 검증 미적용 사유: {holidayPayload.verifyError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {forecastLoading
              ? "파주 일별 예보"
              : `파주 일별 예보 (${forecast?.horizonDays ?? "—"}일)`}
          </CardTitle>
          {forecast?.generatedAt && (
            <p className="text-muted-foreground text-xs">
              생성 시각(서버){" "}
              {format(parseISO(forecast.generatedAt), "yyyy-MM-dd HH:mm", { locale: ko })}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {errForecast && <p className="text-destructive text-sm">{errForecast}</p>}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {forecastLoading && !forecast
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 min-w-[132px] shrink-0 rounded-lg" />
                ))
              : forecast?.days.map((row) => {
                  const w = row.data;
                  const wd = format(parseISO(`${row.date}T12:00:00+09:00`), "M/d (EEE)", {
                    locale: ko,
                  });
                  return (
                    <div
                      key={row.date}
                      className={cn(
                        "bg-card min-w-[132px] shrink-0 rounded-lg border p-3 text-sm shadow-sm",
                        w.warnings.length > 0 && "border-amber-500/50"
                      )}
                    >
                      <div className="text-muted-foreground mb-1 text-xs">
                        <span>{wd}</span>
                      </div>
                      <div className="mb-1 flex items-center gap-1">
                        <span className="text-lg">{w.emoji}</span>
                        <span className="line-clamp-2 text-xs leading-tight">{w.summaryKo}</span>
                      </div>
                      <p className="text-xs [font-variant-numeric:tabular-nums]">
                        {formatInt(w.tmin)}° / {formatInt(w.tmax)}°
                      </p>
                      <p className="text-muted-foreground text-xs [font-variant-numeric:tabular-nums]">
                        강수 {formatInt(w.popMax)}%
                      </p>
                      {w.warnings.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {w.warnings.map((c) => (
                            <Badge key={c} variant="destructive" className="px-1 py-0 text-[10px]">
                              {WARNING_LABEL[c]}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
