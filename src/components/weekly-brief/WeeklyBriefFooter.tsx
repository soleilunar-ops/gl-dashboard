"use client";

import type { GateResult } from "@/lib/dashboard/weekly-brief/types";

interface Props {
  gate: GateResult | null;
  reportId?: string;
}

export function WeeklyBriefFooter({ gate: _gate, reportId }: Props) {
  return (
    <div className="wr-footer">
      {reportId && <a href={`/dashboard?brief=${reportId}&ask=1`}>이 리포트에 대해 질문하기 →</a>}
    </div>
  );
}
