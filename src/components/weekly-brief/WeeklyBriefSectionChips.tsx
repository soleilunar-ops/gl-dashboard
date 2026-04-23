"use client";

import Link from "next/link";
import type { WeeklyBriefSections } from "@/lib/dashboard/weekly-brief/types";

const CHIPS: Array<{ key: keyof WeeklyBriefSections; label: string; short: string }> = [
  { key: "sales_highlight", label: "1. 판매 하이라이트", short: "판매" },
  { key: "weather_trigger", label: "2. 날씨·트리거", short: "날씨" },
  { key: "transport", label: "3. 운송", short: "운송" },
];

interface Props {
  reportId: string;
  sections: WeeklyBriefSections;
}

export function WeeklyBriefSectionChips({ reportId, sections }: Props) {
  return (
    <div className="wr-section-chips">
      {CHIPS.map((c) => {
        const hasContent = Boolean(sections[c.key]);
        if (!hasContent) return null;
        return (
          <Link
            key={c.key}
            href={`/dashboard?brief=${reportId}#section-${c.key}`}
            className="wr-chip"
          >
            <span className="wr-chip-label">{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
