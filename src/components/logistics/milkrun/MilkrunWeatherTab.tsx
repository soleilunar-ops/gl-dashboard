// 변경 이유: 출고일 기준 재작업일(D-2/D-1) 기상청 예보 카드(파주 고정) UI입니다.
"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import type { DailyWeather, WeatherWarningCode } from "@/lib/kma-daily-weather";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { todayKstYmdDash } from "@/lib/kma-time";

type DaySlot =
  | { label: "D-2" | "D-1"; date: string; ok: true; data: DailyWeather }
  | { label: "D-2" | "D-1"; date: string; ok: false; message: string };

type OrderWeatherPayload = {
  orderDate: string;
  locationLabel: string;
  days: DaySlot[];
};

const WARNING_LABEL: Record<WeatherWarningCode, string> = {
  우천주의: "우천 주의 · 재작업 지연 가능",
  강풍주의: "강풍 주의",
  한파주의: "한파 주의",
  폭염주의: "폭염 주의",
};

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ko-KR");
}

function WeatherCardBody({ slot, onRetry }: { slot: DaySlot; onRetry: () => void }) {
  if (!slot.ok) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{slot.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    );
  }

  const w = slot.data;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{w.source}</Badge>
        <span className="text-2xl">{w.emoji}</span>
        <span className="font-medium">{w.summaryKo}</span>
      </div>
      <p>{`최고 ${formatInt(w.tmax)}°C / 최저 ${formatInt(w.tmin)}°C`}</p>
      <p>{`강수확률 ${formatInt(w.popMax)}%`}</p>
      <p>
        강수량(mm): {w.source === "단기예보" && w.pcpSum !== undefined ? formatInt(w.pcpSum) : "—"}
      </p>
      <p>
        풍속(m/s): {w.source === "단기예보" && w.wsdMax !== undefined ? formatInt(w.wsdMax) : "—"}
      </p>
      <p>
        습도(%): {w.source === "단기예보" && w.rehAvg !== undefined ? formatInt(w.rehAvg) : "—"}
      </p>
      {w.warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {w.warnings.map((code) => (
            <Badge key={code} variant="destructive" className="font-normal">
              {WARNING_LABEL[code]}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MilkrunWeatherTab() {
  const [orderDate, setOrderDate] = useState<string>(() => todayKstYmdDash());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<OrderWeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather?orderDate=${encodeURIComponent(orderDate)}`);
      const data = (await res.json()) as OrderWeatherPayload & { message?: string };
      if (!res.ok) {
        setError(data.message ?? "날씨를 불러오지 못했습니다.");
        setPayload(null);
        return;
      }
      if (!data.days || !Array.isArray(data.days)) {
        setError("응답 형식이 올바르지 않습니다.");
        setPayload(null);
        return;
      }
      setPayload(data);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [orderDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleFor = (slot: DaySlot) => {
    const d = parseISO(`${slot.date}T12:00:00+09:00`);
    const wd = format(d, "yyyy-MM-dd (EEE)", { locale: ko });
    return `${wd} — ${slot.label}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="font-normal">
              <CalendarDays className="mr-2 h-4 w-4" />
              출고일: {orderDate}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={orderDate ? parseISO(`${orderDate}T12:00:00+09:00`) : undefined}
              onSelect={(d) => {
                if (d) {
                  setOrderDate(format(d, "yyyy-MM-dd"));
                  setOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground text-sm">📍 파주시 (고정)</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
          새로고침
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
            <Button
              type="button"
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={() => void load()}
            >
              재시도
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {loading
          ? [0, 1].map((i) => (
              <Card key={`sk-${i}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <Skeleton className="h-5 w-48" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))
          : (payload?.days ?? []).map((slot) => (
              <Card
                key={`${slot.label}-${slot.date}`}
                className={cn(slot.ok && slot.data.warnings.length > 0 && "border-amber-500/40")}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{titleFor(slot)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {payload ? <WeatherCardBody slot={slot} onRetry={() => void load()} /> : null}
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
