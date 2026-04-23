"use client";

// 08 v0.3 — 하루루 브리핑 카드 쉘. 3열 body + CTA.
import { useDemoData } from "@/lib/demo";
import { BriefingHeader } from "./BriefingHeader";
import { BriefingWeatherColumn } from "./BriefingWeatherColumn";
import { BriefingInventoryColumn } from "./BriefingInventoryColumn";
import { BriefingActionColumn } from "./BriefingActionColumn";
import "./briefing.css";

export function BriefingCard() {
  const { profile } = useDemoData();

  return (
    <div className="hb-root">
      <article className="hb-card">
        <BriefingHeader header={profile.header} />

        <div className="hb-body-3col">
          <BriefingWeatherColumn data={profile.weather} />
          <BriefingInventoryColumn data={profile.inventory} />
          <BriefingActionColumn data={profile.action} />
        </div>

        <div className="hb-cta-wrap">
          <button type="button" className="hb-cta-button">
            상세 보기 및 발주 관리
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </article>
    </div>
  );
}
