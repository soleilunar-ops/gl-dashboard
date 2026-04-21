"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import KpiCard, { type DeltaTone } from "./KpiCard";
import { useSeasonStats } from "./_hooks/useSeasonStats";
import type { SeasonStats } from "./_types";

interface Props {
  season: string | null;
}

function pctDelta(
  cur: number | null | undefined,
  base: number | null | undefined
): { text: string; tone: DeltaTone } | undefined {
  if (cur == null || base == null || base === 0) return undefined;
  const d = ((cur - base) / base) * 100;
  return {
    text: `25시즌 대비 ${d >= 0 ? "+" : ""}${d.toFixed(1)}%`,
    tone: d > 1 ? "up" : d < -1 ? "down" : "neutral",
  };
}

function rLogDelta(
  cur: number | null | undefined,
  base: number | null | undefined
): { text: string; tone: DeltaTone } | undefined {
  if (cur == null || base == null) return undefined;
  const d = Math.abs(cur) - Math.abs(base);
  const word = d >= 0 ? "강화" : "약화";
  return {
    text: `25시즌 대비 상관 ${word}`,
    tone: d > 0.02 ? "up" : d < -0.02 ? "down" : "neutral",
  };
}

function mmdd(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function sameSeasonDayDelta(
  curIso: string | null | undefined,
  baseIso: string | null | undefined
): { text: string; tone: DeltaTone } | undefined {
  if (!curIso || !baseIso) return undefined;
  const cur = new Date(curIso);
  const base = new Date(baseIso);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(base.getTime())) return undefined;
  const baseAligned = new Date(cur.getFullYear(), base.getMonth(), base.getDate());
  const diff = Math.round((cur.getTime() - baseAligned.getTime()) / 86400000);
  const label =
    diff === 0
      ? "25시즌과 동일"
      : diff > 0
        ? `25시즌보다 ${diff}일 늦음`
        : `25시즌보다 ${Math.abs(diff)}일 빠름`;
  return { text: label, tone: "neutral" };
}

function buildCards(current: SeasonStats | null, baseline: SeasonStats | null) {
  return [
    {
      label: "총 판매량",
      value:
        current?.total_units != null ? `${current.total_units.toLocaleString("ko-KR")}개` : "–",
      delta: pctDelta(current?.total_units, baseline?.total_units),
      hint:
        baseline?.total_units != null
          ? `25시즌 ${baseline.total_units.toLocaleString("ko-KR")}`
          : undefined,
    },
    {
      label: "기온-판매 민감도",
      value: current?.r_log != null ? current.r_log.toFixed(3) : "–",
      delta: rLogDelta(current?.r_log, baseline?.r_log),
      hint: baseline?.r_log != null ? `25시즌 ${baseline.r_log.toFixed(3)} (강함)` : undefined,
    },
    {
      label: "최고 판매일",
      value: mmdd(current?.peak_date),
      delta: sameSeasonDayDelta(current?.peak_date, baseline?.peak_date),
      hint:
        current?.peak_units != null
          ? `${current.peak_units.toLocaleString("ko-KR")}개 판매`
          : baseline?.peak_date
            ? `25시즌 ${mmdd(baseline.peak_date)}`
            : undefined,
    },
    {
      label: "첫 영하일",
      value: mmdd(current?.first_freeze),
      delta: sameSeasonDayDelta(current?.first_freeze, baseline?.first_freeze),
      hint: baseline?.first_freeze ? `25시즌 ${mmdd(baseline.first_freeze)}` : undefined,
    },
  ];
}

/**
 * 4 KPI 카드 + 25시즌 기준선 대비 델타.
 * M2 산출물. sparkline은 M7 보강 예정.
 */
export default function SeasonKpiStrip({ season }: Props) {
  const { data, loading, error } = useSeasonStats(season);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive rounded-md border p-3 text-sm">KPI 조회 실패: {error}</div>
    );
  }

  const cards = buildCards(data.current, data.baseline);
  const insight = buildInsightSentence(data.current, data.baseline);

  return (
    <div className="space-y-2">
      {insight && (
        <div className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">요약: </span>
          {insight}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.label} label={c.label} value={c.value} delta={c.delta} hint={c.hint} />
        ))}
      </div>
    </div>
  );
}

function buildInsightSentence(current: SeasonStats | null, baseline: SeasonStats | null): string {
  const parts: string[] = [];
  if (current?.total_units != null && baseline?.total_units) {
    const d = ((current.total_units - baseline.total_units) / baseline.total_units) * 100;
    const sign = d >= 0 ? "+" : "";
    parts.push(`총 판매 ${sign}${d.toFixed(1)}%`);
  }
  if (current?.first_freeze && baseline?.first_freeze) {
    const cur = new Date(current.first_freeze);
    const base = new Date(baseline.first_freeze);
    const aligned = new Date(cur.getFullYear(), base.getMonth(), base.getDate());
    const diff = Math.round((cur.getTime() - aligned.getTime()) / 86400000);
    if (diff !== 0) {
      parts.push(`첫 영하 ${diff > 0 ? `${diff}일 늦음` : `${Math.abs(diff)}일 빠름`}`);
    }
  }
  if (current?.r_log != null) {
    const abs = Math.abs(current.r_log);
    const strength = abs >= 0.8 ? "강함" : abs >= 0.5 ? "보통" : "약함";
    parts.push(`기온 민감도 ${strength}`);
  }
  if (parts.length === 0) return "";
  return `25시즌 대비 ${parts.join(" · ")}`;
}
