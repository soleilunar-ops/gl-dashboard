"use client";

import { stripRef } from "@/lib/dashboard/weekly-brief/stripRef";

interface Props {
  headline: string;
}

export function WeeklyBriefHeadline({ headline }: Props) {
  return (
    <div className="wr-headline">
      <svg
        className="wr-headline-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
      </svg>
      <div className="wr-headline-body">
        <div className="wr-headline-label">이번 주 헤드라인</div>
        <p className="wr-headline-text">{stripRef(headline)}</p>
      </div>
    </div>
  );
}
