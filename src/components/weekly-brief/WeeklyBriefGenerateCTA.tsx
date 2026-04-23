"use client";

// 07 v0.2 — 하단 주황 CTA.
// 요일 제한은 DB 함수 can_generate_weekly_brief()에서 이미 상시 allowed:true 반환.
import type { GateResult } from "@/lib/dashboard/weekly-brief/types";
import { useGenerateWeeklyBrief } from "@/lib/dashboard/weekly-brief/useGenerateWeeklyBrief";
import { WeeklyBriefProgress } from "./WeeklyBriefProgress";

interface Props {
  gate: GateResult | null;
  gateLoading: boolean;
  onSuccess?: () => void;
}

export function WeeklyBriefGenerateCTA({ gate, gateLoading, onSuccess }: Props) {
  const generate = useGenerateWeeklyBrief({ onSuccess });

  // gate 로딩이어도 CTA 즉시 활성화 (상시 허용)
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
            generate.mutate({});
          }}
        >
          다시 생성하기
        </button>
      </div>
    );
  }

  return (
    <div className="wr-cta-wrap">
      <button
        type="button"
        className="wr-cta-button wr-cta-primary"
        onClick={() => generate.mutate({})}
        data-testid="weekly-brief-generate"
      >
        <SparkleIcon />
        이번 주 리포트 새로 생성하기
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
