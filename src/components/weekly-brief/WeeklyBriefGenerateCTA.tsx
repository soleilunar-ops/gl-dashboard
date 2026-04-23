"use client";

// 07 v0.3 — 하단 CTA. 대상 주차는 shadcn Calendar Popover로 선택.
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { GateResult } from "@/lib/dashboard/weekly-brief/types";
import { useGenerateWeeklyBrief } from "@/lib/dashboard/weekly-brief/useGenerateWeeklyBrief";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { WeeklyBriefProgress } from "./WeeklyBriefProgress";

interface Props {
  gate: GateResult | null;
  gateLoading: boolean;
  onSuccess?: () => void;
}

// 주어진 날짜의 ISO 월요일(주 시작) 반환
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

function mondayOfDate(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return mondayOf(iso);
}

function defaultWeekStart(): string {
  const envDate = process.env.NEXT_PUBLIC_DASHBOARD_DATE;
  const today = envDate ?? new Date().toISOString().slice(0, 10);
  return mondayOf(today);
}

// "YYYY-MM-DD" → 몇 주차(ISO week)
function weekNumber(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

export function WeeklyBriefGenerateCTA({ gate, gateLoading: _gateLoading, onSuccess }: Props) {
  const generate = useGenerateWeeklyBrief({ onSuccess });
  const [weekStart, setWeekStart] = useState<string>(defaultWeekStart());
  const [calendarOpen, setCalendarOpen] = useState(false);

  if (generate.isPending) {
    return (
      <div className="wr-cta-wrap">
        <WeeklyBriefProgress />
      </div>
    );
  }

  if (generate.isError) {
    return (
      <div className="wr-cta-wrap">
        <div className="wr-error-box">
          생성 중 오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.
          <p className="wr-error-detail">{generate.error?.message}</p>
        </div>
        <button
          type="button"
          className="wr-cta-button wr-cta-primary"
          onClick={() => {
            generate.reset();
            generate.mutate({ force: true, weekStart });
          }}
        >
          다시 생성하기
        </button>
      </div>
    );
  }

  const wn = weekNumber(weekStart);

  const ctaHeight = 44;
  const ctaWidth = 200;

  return (
    <div className="wr-cta-wrap">
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="wr-date-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: ctaHeight,
                width: ctaWidth,
                padding: "0 16px",
                borderRadius: 8,
                border: "1px solid #F0E2B4",
                background: "#FFFBEB",
                color: "#5c3f00",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <CalendarDays size={14} />
              {weekStart}
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-auto border-[#F0E2B4] bg-[#FFFBEB] p-2">
            <Calendar
              mode="single"
              selected={new Date(weekStart + "T00:00:00Z")}
              onSelect={(date) => {
                if (!date) return;
                setWeekStart(mondayOfDate(date));
                setCalendarOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <button
          type="button"
          className="wr-cta-button wr-cta-primary"
          onClick={() => generate.mutate({ force: true, weekStart })}
          data-testid="weekly-brief-generate"
          style={{
            width: ctaWidth,
            height: ctaHeight,
            padding: "0 16px",
            background: "#BBBF4E",
            boxShadow: "0 4px 12px -2px rgba(187, 191, 78, 0.35)",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        >
          {wn}주차 리포트 생성
        </button>
      </div>
      <p
        style={{
          marginTop: 10,
          textAlign: "center",
          fontSize: 12,
          color: "var(--wr-muted)",
          fontFamily: "inherit",
          fontWeight: 500,
        }}
      >
        금주 {gate?.count_this_week ?? 0}/{gate?.limit ?? 999}회 사용
      </p>
    </div>
  );
}
