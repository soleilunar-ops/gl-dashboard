"use client";

// 08 v0.3 — 메인 레이아웃: Topbar → Briefing → Narrative → WeeklyBrief
import { Suspense } from "react";
import { DashboardTopbar } from "./DashboardTopbar";
import { NarrativeBridge } from "./NarrativeBridge";
import { BriefingCard } from "@/components/briefing/BriefingCard";
import { WeeklyBriefCard } from "@/components/weekly-brief/WeeklyBriefCard";
import { WeeklyBriefModal } from "@/components/weekly-brief/WeeklyBriefModal";

export function DashboardMain() {
  return (
    <>
      <main className="dashboard-main">
        <DashboardTopbar />

        <section className="dashboard-section">
          <BriefingCard />
        </section>

        <NarrativeBridge />

        <section className="dashboard-section">
          <WeeklyBriefCard />
        </section>
      </main>

      {/* ?brief=<id> URL 파라미터로 모달 열림 */}
      <Suspense fallback={null}>
        <WeeklyBriefModal />
      </Suspense>
    </>
  );
}
