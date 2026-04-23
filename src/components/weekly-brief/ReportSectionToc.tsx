"use client";

import { useEffect, useState } from "react";
import type { WeeklyBriefSections } from "@/lib/dashboard/weekly-brief/types";

const TOC_ORDER: Array<{ key: keyof WeeklyBriefSections; label: string }> = [
  { key: "orders", label: "§ 1 주문" },
  { key: "hotpack_season", label: "§ 2 핫팩 시즌" },
  { key: "offseason", label: "§ 2' 비시즌" },
  { key: "inventory", label: "§ 3 총재고" },
  { key: "import_leadtime", label: "§ 4 수입 리드타임" },
  { key: "milkrun", label: "§ 5 쿠팡 밀크런" },
  { key: "external", label: "§ 6 외부 신호" },
  { key: "noncompliance", label: "§ 7 납품 미준수" },
];

interface Props {
  sections: WeeklyBriefSections;
  containerRef?: React.RefObject<HTMLElement | null>;
}

export function ReportSectionToc({ sections, containerRef }: Props) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const root = containerRef?.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            if (id.startsWith("section-")) {
              setActive(id.replace("section-", ""));
            }
          }
        }
      },
      { root, rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    const sectionEls = root.querySelectorAll("section.wr-section");
    sectionEls.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [containerRef]);

  const visible = TOC_ORDER.filter((t) => sections[t.key]);

  return (
    <nav aria-label="리포트 목차">
      <ul className="wr-toc-list">
        <li>
          <a
            href="#section-insight"
            className={`wr-toc-item ${active === "insight" ? "is-active" : ""}`}
          >
            🔍 인사이트
          </a>
        </li>
        {visible.map((t) => (
          <li key={t.key}>
            <a
              href={`#section-${t.key}`}
              className={`wr-toc-item ${active === t.key ? "is-active" : ""}`}
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
