"use client";

import Link from "next/link";
import type { WeeklyBriefSections } from "@/lib/dashboard/weekly-brief/types";

const CHIPS: Array<{ key: keyof WeeklyBriefSections; label: string; short: string }> = [
  { key: "orders", label: "§ 1 주문", short: "주문" },
  { key: "hotpack_season", label: "§ 2 시즌", short: "시즌" },
  { key: "inventory", label: "§ 3 재고", short: "재고" },
  { key: "import_leadtime", label: "§ 4 수입", short: "수입" },
  { key: "milkrun", label: "§ 5 밀크런", short: "밀크런" },
  { key: "external", label: "§ 6 외부", short: "외부" },
  { key: "noncompliance", label: "§ 7 미준수", short: "미준수" },
];

interface Props {
  reportId: string;
  sections: WeeklyBriefSections;
}

export function WeeklyBriefSectionChips({ reportId, sections }: Props) {
  return (
    <div className="wr-section-chips">
      {CHIPS.map((c) => {
        const key: keyof WeeklyBriefSections =
          c.key === "hotpack_season" && !sections.hotpack_season && sections.offseason
            ? "offseason"
            : c.key;
        const hasContent = Boolean(sections[key]);
        if (!hasContent) return null;
        return (
          <Link
            key={c.key}
            href={`/dashboard?brief=${reportId}#section-${key}`}
            className="wr-chip"
          >
            <span className="wr-chip-label">{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
