"use client";

import type { GateResult } from "@/lib/dashboard/weekly-brief/types";

interface Props {
  gate: GateResult | null;
  reportId?: string;
}

function gateHint(gate: GateResult | null): string {
  if (!gate) return "";
  if (gate.allowed) {
    return `금주 ${gate.count_this_week}/${gate.limit}회 사용`;
  }
  if (gate.reason?.includes("한도")) {
    return `금주 생성 한도 도달 (${gate.count_this_week}/${gate.limit})`;
  }
  const next =
    gate.next_available === "this_friday"
      ? "금요일"
      : gate.next_available === "this_monday"
        ? "월요일"
        : "다음 주 월요일";
  return `다음 생성 가능: ${next}`;
}

export function WeeklyBriefFooter({ gate, reportId }: Props) {
  return (
    <div className="wr-footer">
      <span>{gateHint(gate)}</span>
      {reportId && (
        <a href={`/dashboard?brief=${reportId}&ask=1`}>💬 이 리포트에 대해 질문하기 →</a>
      )}
    </div>
  );
}
