"use client";

// 07 v0.3 — 하단 주황 CTA. 대상 주차 선택 가능.
import { useState } from "react";
import type { GateResult } from "@/lib/dashboard/weekly-brief/types";
import { useGenerateWeeklyBrief } from "@/lib/dashboard/weekly-brief/useGenerateWeeklyBrief";
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

function defaultWeekStart(): string {
  const envDate = process.env.NEXT_PUBLIC_DASHBOARD_DATE;
  const today = envDate ?? new Date().toISOString().slice(0, 10);
  return mondayOf(today);
}

export function WeeklyBriefGenerateCTA({ gate, gateLoading, onSuccess }: Props) {
  const generate = useGenerateWeeklyBrief({ onSuccess });
  const [weekStart, setWeekStart] = useState<string>(defaultWeekStart());

  void gateLoading;

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
          ⚠ 생성 중 오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.
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

  return (
    <div className="wr-cta-wrap">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: "var(--wr-muted)", fontWeight: 500 }}>
          대상 주차 (월요일)
        </label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(mondayOf(e.target.value))}
          style={{
            padding: "6px 10px",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
      </div>
      <button
        type="button"
        className="wr-cta-button wr-cta-primary"
        onClick={() => generate.mutate({ force: true, weekStart })}
        data-testid="weekly-brief-generate"
      >
        <SparkleIcon />
        {weekStart} 주차 리포트 새로 생성하기
      </button>
      <p className="wr-cta-hint">금주 {gate?.count_this_week ?? 0}회 생성 · 약 15~25초 소요</p>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />
    </svg>
  );
}
