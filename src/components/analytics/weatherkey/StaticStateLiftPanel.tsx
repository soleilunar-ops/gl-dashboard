"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSeasonStateLift } from "./_hooks/useSeasonStateLift";
import type { WeatherStateLift } from "./_types";

interface Props {
  season: string | null;
}

function multiplierClass(m: number | null | undefined): string {
  if (m == null) return "text-muted-foreground";
  if (m >= 2.0) return "font-semibold text-[color:var(--hotpack-trigger-critical)]";
  if (m >= 1.2) return "font-medium text-[color:var(--hotpack-trigger-high)]";
  if (m < 0.8) return "text-muted-foreground";
  return "";
}

/** 한글 이름만 — 뒤의 조건 설명은 제거 */
const STATE_SIMPLE_NAME: Record<string, string> = {
  cold_wave: "한파",
  freeze: "영하일",
  snow: "강설",
  big_tdiff: "큰 일교차",
  rain_only: "강우",
  warm: "따뜻",
  cold_and_big_diff: "선선+큰 일교차",
};

/** 공백 이전 한글 부분만 남김 — 맵 미포함 상태에 대한 폴백 */
function simplifyStateName(
  label: string | null | undefined,
  key: string | null | undefined
): string {
  if (key && STATE_SIMPLE_NAME[key]) return STATE_SIMPLE_NAME[key];
  if (!label) return key ?? "–";
  // 괄호/공백 앞 부분만 (예: "한파 (최저기온 −12℃)" → "한파")
  const idx = Math.min(...["(", " ", ":"].map((ch) => label.indexOf(ch)).filter((i) => i > 0));
  return Number.isFinite(idx) && idx > 0 ? label.slice(0, idx) : label;
}

/**
 * 날씨별 판매 배수 표 — v_weather_state_lift.
 * 날씨 경보 이력(전날 대비 변화) 옆에 나란히 배치되는 "그 날씨 자체" 기준 배수.
 * 6개 상태: cold_wave, freeze, snow, big_tdiff, rain_only, warm.
 */
export default function StaticStateLiftPanel({ season }: Props) {
  const { data, loading, error } = useSeasonStateLift(season);

  const sorted = useMemo(
    () => [...data].sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0)),
    [data]
  );

  if (!season) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">
          시즌을 선택해주세요.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="text-destructive p-4 text-sm">{error}</CardContent>
      </Card>
    );
  }

  const hasData = sorted.some((r) => r.multiplier != null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="text-base font-semibold">날씨별 판매 배수</div>

        {!hasData ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            시즌 내 집계 데이터 없음
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F2BE5C]/10 hover:bg-[#F2BE5C]/10">
                <TableHead className="text-foreground w-[40%] font-semibold">날씨 상태</TableHead>
                <TableHead className="text-foreground text-right font-semibold">해당일수</TableHead>
                <TableHead className="text-foreground text-right font-semibold">배수</TableHead>
                <TableHead className="text-foreground text-right font-semibold">
                  해당일 평균 판매
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <StateRow key={r.state_key ?? r.state_label ?? ""} row={r} />
              ))}
            </TableBody>
          </Table>
        )}

        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          배수 = 그 날씨일 때 판매 평균 ÷ 평소(시즌 9~3월 전체 일평균). 1.0 이상이면 평소보다 많이
          팔린 날씨
        </p>
      </CardContent>
    </Card>
  );
}

function StateRow({ row }: { row: WeatherStateLift }) {
  const mult = row.multiplier;
  return (
    <TableRow>
      <TableCell className="font-medium">
        {simplifyStateName(row.state_label, row.state_key)}
      </TableCell>
      <TableCell className="text-muted-foreground text-right tabular-nums">
        {row.fired_days ?? 0}일
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", multiplierClass(mult))}>
        {mult != null ? `${mult.toFixed(2)}×` : "–"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.avg_when_fired != null ? row.avg_when_fired.toLocaleString("ko-KR") : "–"}
      </TableCell>
    </TableRow>
  );
}
