"use client";

import { stripRef } from "@/lib/dashboard/weekly-brief/stripRef";

interface Props {
  headline: string;
}

export function WeeklyBriefHeadline({ headline }: Props) {
  return (
    <div className="wr-headline">
      <div className="wr-headline-body">
        <div className="wr-headline-label">이번 주 헤드라인</div>
        <p className="wr-headline-text">{stripRef(headline)}</p>
      </div>
    </div>
  );
}
