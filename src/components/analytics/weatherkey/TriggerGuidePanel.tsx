"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  kind: "급증 감지" | "날씨";
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
  const [open, setOpen] = useState(true);

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
        kind: "날씨",
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
    <Card className="py-0">
      <CardContent className="flex flex-col gap-2 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-base font-semibold"
          aria-expanded={open}
        >
          <span>표시 기준</span>
          <ChevronDown
            className={cn("h-5 w-5 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open ? (
          <>
            <Table>
              <TableHeader className="bg-[#FFFBEB]">
                <TableRow>
                  <TableHead className="w-[160px]">이름</TableHead>
                  <TableHead>조건</TableHead>
                  <TableHead className="w-[80px] text-center">발동일</TableHead>
                  <TableHead className="w-[80px] text-center">배수</TableHead>
                  <TableHead className="w-[80px] text-center">비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.kind}-${r.name}`}>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs leading-snug">
                      {r.condition}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {r.firedDays != null ? `${r.firedDays}일` : "–"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        r.multiplier != null && r.multiplier >= 2
                          ? "font-semibold text-[color:var(--hotpack-trigger-critical)]"
                          : r.multiplier != null && r.multiplier >= 1.2
                            ? "font-medium text-[color:var(--hotpack-trigger-high)]"
                            : "text-muted-foreground"
                      )}
                    >
                      {r.multiplier != null ? `${r.multiplier.toFixed(2)}배` : "–"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={
                          r.kind === "급증 감지"
                            ? {
                                color: "var(--hotpack-trigger-critical)",
                                backgroundColor:
                                  "color-mix(in srgb, var(--hotpack-trigger-critical) 12%, transparent)",
                              }
                            : {
                                color: "#5C5F1F",
                                backgroundColor: "#BBBF4E22",
                              }
                        }
                      >
                        {r.kind}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="text-muted-foreground mt-1 px-3 py-1.5 text-xs leading-relaxed">
              급증 감지 : 전날 대비 판매 배수 변화가 큰 날. 날씨 : 특정 날씨일 때 나타나는 판매 배수
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
