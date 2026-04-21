"use client";

import { useMemo } from "react";
import { Snowflake, Zap } from "lucide-react";
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
import { useSeasonTriggerEffects } from "./_hooks/useSeasonTriggerEffects";

type GuideRow = {
  name: string;
  condition: string;
  kind: "급증 감지" | "절대 상태";
  firedDays: number | null;
  multiplier: number | null;
};

const STATE_LABEL: Record<string, { name: string; condition: string }> = {
  cold_wave: { name: "한파", condition: "최저기온 −12℃ 이하" },
  freeze: { name: "영하일", condition: "최고기온 0℃ 미만" },
  snow: { name: "강설", condition: "적설량 > 0 (눈 오는 날)" },
  big_tdiff: { name: "큰 일교차", condition: "일교차 ≥ 10℃" },
  rain_only: { name: "강우", condition: "비 ○ · 눈 ×" },
  warm: { name: "따뜻", condition: "최고기온 ≥ 15℃" },
  cold_and_big_diff: {
    name: "선선+큰 일교차",
    condition: "최고기온 0~10℃ & 일교차 8~12℃",
  },
};

const TRIGGER_LABEL: Record<string, { name: string; condition: string }> = {
  cold_shock: { name: "갑작스러운 추위", condition: "전날 대비 최저기온 6℃ 이상 하락" },
  compound: {
    name: "한파+영하 동시",
    condition: "'갑작스러운 추위'와 '첫 영하'가 같은 날 동시 발동",
  },
  first_freeze: { name: "첫 영하", condition: "시즌 첫 최저기온 0℃ 미만" },
};

interface Props {
  season: string | null;
}

export default function TriggerGuidePanel({ season }: Props) {
  const { data: effects, loading: eLoading } = useSeasonTriggerEffects(season);
  const { data: states, loading: sLoading } = useSeasonStateLift(season);

  const rows: GuideRow[] = useMemo(() => {
    const out: GuideRow[] = [];

    // B: 급증 감지 트리거
    for (const key of ["compound", "cold_shock", "first_freeze"] as const) {
      const e = effects.find((r) => r.trigger_key === key);
      const meta = TRIGGER_LABEL[key];
      out.push({
        name: meta.name,
        condition: meta.condition,
        kind: "급증 감지",
        firedDays: e?.fired_days ?? null,
        multiplier: e?.multiplier != null ? Number(e.multiplier) : null,
      });
    }

    // A: 절대 상태 (배수 내림차순)
    const sorted = [...states].sort(
      (a, b) => (Number(b.multiplier) || 0) - (Number(a.multiplier) || 0)
    );
    for (const s of sorted) {
      if (!s.state_key) continue;
      const meta = STATE_LABEL[s.state_key] ?? {
        name: s.state_label ?? s.state_key,
        condition: "—",
      };
      out.push({
        name: meta.name,
        condition: meta.condition,
        kind: "절대 상태",
        firedDays: s.fired_days ?? null,
        multiplier: s.multiplier != null ? Number(s.multiplier) : null,
      });
    }

    return out;
  }, [effects, states]);

  const loading = eLoading || sLoading;

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
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <div className="text-base font-semibold">트리거 기준 가이드</div>
          <div className="text-muted-foreground text-sm">
            <span className="font-medium">{season}</span> 기준 · **급증 감지**(전날 대비 변화)와{" "}
            **절대 상태**(그 날씨 자체) 두 종류
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">이름</TableHead>
              <TableHead>조건</TableHead>
              <TableHead className="w-[100px]">성격</TableHead>
              <TableHead className="w-[90px] text-right">발동일</TableHead>
              <TableHead className="w-[90px] text-right">배수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.kind}-${r.name}`}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <KindIcon kind={r.kind} />
                    <span className="font-medium">{r.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs leading-snug">
                  {r.condition}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      r.kind === "급증 감지"
                        ? "border-[color:var(--hotpack-trigger-critical)]/40 text-[color:var(--hotpack-trigger-critical)]"
                        : "border-[color:var(--hotpack-trigger-high)]/40 text-[color:var(--hotpack-trigger-high)]"
                    )}
                  >
                    {r.kind}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.firedDays != null ? `${r.firedDays}일` : "–"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    r.multiplier != null && r.multiplier >= 2
                      ? "font-semibold text-[color:var(--hotpack-trigger-critical)]"
                      : r.multiplier != null && r.multiplier >= 1.2
                        ? "font-medium text-[color:var(--hotpack-trigger-high)]"
                        : "text-muted-foreground"
                  )}
                >
                  {r.multiplier != null ? `${r.multiplier.toFixed(2)}배` : "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="text-muted-foreground mt-1 rounded border border-dashed px-3 py-1.5 text-xs leading-relaxed">
          💡 <b>급증 감지</b>는 전날 대비 변화가 큰 날 ( `시즌 날씨 경보 이력` 섹션에 카드로 표시).
          <b>절대 상태</b>는 날씨 자체가 특정 조건일 때 나타나는 판매 배수 ( `날씨별 판매 배수`
          섹션에 표시).
        </div>
      </CardContent>
    </Card>
  );
}

function KindIcon({ kind }: { kind: GuideRow["kind"] }) {
  if (kind === "급증 감지") {
    return <Zap className="h-3.5 w-3.5 text-[color:var(--hotpack-trigger-critical)]" aria-hidden />;
  }
  return <Snowflake className="h-3.5 w-3.5 text-[color:var(--hotpack-trigger-high)]" aria-hidden />;
}
