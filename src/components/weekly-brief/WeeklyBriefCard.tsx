"use client";

// 07 v0.2 — 주간 리포트 메인 카드. 5 상태 머신 (A~E)
// A: 금주 리포트 존재 · B: 없음+월/금 · C: 없음+그외 · D: 2/2 도달 · E: 생성 중
//
// A/D: 헤드라인·주의사항·섹션 칩 + 하단 CTA (D는 비활성)
// B:   히스토리 + 주황 CTA 활성
// C:   히스토리 + 회색 비활성 버튼
// E:   CTA 내부에서 Progress 표시 (CTA 컴포넌트가 분기)

import { useMemo, useState } from "react";
import { useWeeklyBriefGate } from "@/lib/dashboard/weekly-brief/useWeeklyBriefGate";
import { useWeeklyBriefList } from "@/lib/dashboard/weekly-brief/useWeeklyBriefList";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { WeeklyBriefHeadline } from "./WeeklyBriefHeadline";
import { WeeklyBriefAlerts } from "./WeeklyBriefAlerts";
import { WeeklyBriefSectionChips } from "./WeeklyBriefSectionChips";
import { WeeklyBriefFooter } from "./WeeklyBriefFooter";
import { WeeklyBriefGenerateCTA } from "./WeeklyBriefGenerateCTA";
import { WeeklyBriefHistory } from "./WeeklyBriefHistory";
import { WeeklyBriefHistoryModal } from "./WeeklyBriefHistoryModal";
import "./weekly-brief.css";

function currentWeekStart(): string {
  const d = new Date();
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1));
  return monday.toISOString().slice(0, 10);
}

function isThisWeek(iso: string): boolean {
  const ws = currentWeekStart();
  const genDate = iso.slice(0, 10);
  return genDate >= ws;
}

export function WeeklyBriefCard() {
  const { data: gate, isLoading: gateLoading, refetch: refetchGate } = useWeeklyBriefGate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: reports } = useWeeklyBriefList(5, refreshKey);
  const audio = useAudioPlayer();

  // 금주 리포트 1건 찾기 (가장 최근)
  const thisWeekReport = useMemo(
    () => reports.find((r) => isThisWeek(r.generated_at)) ?? null,
    [reports]
  );

  const onGenerateSuccess = () => {
    setRefreshKey((k) => k + 1);
    refetchGate();
  };

  // 상태 분기
  const hasReport = !!thisWeekReport;

  return (
    <div className="wr-root">
      <article className="wr-card">
        {hasReport ? (
          <>
            {/* 상태 A / D */}
            <header className="wr-card-header">
              <div className="wr-header-main">
                <div className="wr-header-badge">
                  <span aria-hidden>📋</span>
                  <span>주간 리포트</span>
                </div>
                <h2 className="wr-header-title">
                  {thisWeekReport.parsed.metadata.week_start} ~{" "}
                  {thisWeekReport.parsed.metadata.week_end}
                </h2>
                <p className="wr-header-meta">
                  생성 {new Date(thisWeekReport.generated_at).toLocaleString("ko-KR")} ·{" "}
                  {thisWeekReport.season}
                </p>
              </div>
              <div className="wr-header-actions">
                <a href={`/dashboard?brief=${thisWeekReport.id}`} className="wr-btn">
                  📄 전체 보기
                </a>
                <button
                  type="button"
                  className="wr-btn"
                  onClick={() => setHistoryOpen(true)}
                  aria-label="저장된 리포트 전체 보기"
                >
                  📚 지난 리포트
                </button>
                <button
                  type="button"
                  className={`wr-btn ${
                    audio.reportId === thisWeekReport.id &&
                    audio.section === "insight" &&
                    audio.isPlaying
                      ? "is-active"
                      : ""
                  }`}
                  onClick={() => {
                    if (
                      audio.reportId === thisWeekReport.id &&
                      audio.section === "insight" &&
                      audio.isPlaying
                    ) {
                      audio.pauseResume();
                    } else {
                      audio.play(thisWeekReport.id, "insight");
                    }
                  }}
                  disabled={
                    audio.isLoading &&
                    audio.reportId === thisWeekReport.id &&
                    audio.section === "insight"
                  }
                  aria-label="이번 주 인사이트 음성 재생"
                >
                  {audio.isLoading &&
                  audio.reportId === thisWeekReport.id &&
                  audio.section === "insight"
                    ? "⏳ 생성 중..."
                    : audio.reportId === thisWeekReport.id &&
                        audio.section === "insight" &&
                        audio.isPlaying
                      ? "⏸ 일시정지"
                      : "🔊 인사이트"}
                </button>
              </div>
            </header>

            <WeeklyBriefHeadline headline={thisWeekReport.parsed.insight.headline} />
            <WeeklyBriefAlerts alerts={thisWeekReport.parsed.insight.alerts} />
            <WeeklyBriefSectionChips
              reportId={thisWeekReport.id}
              sections={thisWeekReport.parsed.sections}
            />
            <WeeklyBriefFooter gate={gate} reportId={thisWeekReport.id} />
            <WeeklyBriefGenerateCTA
              gate={gate}
              gateLoading={gateLoading}
              onSuccess={onGenerateSuccess}
            />
          </>
        ) : (
          <>
            {/* 상태 B / C / E */}
            <header className="wr-card-header">
              <div className="wr-header-main">
                <div className="wr-header-badge">
                  <span aria-hidden>📋</span>
                  <span>주간 리포트</span>
                </div>
                <h2 className="wr-header-title">이번 주 리포트를 생성해 보세요</h2>
                <p className="wr-header-meta">
                  최근 7일 데이터 집계 + Claude Sonnet 4.6 · 약 15~25초 소요
                </p>
              </div>
              <div className="wr-header-actions">
                <button
                  type="button"
                  className="wr-btn"
                  onClick={() => setHistoryOpen(true)}
                  aria-label="저장된 리포트 전체 보기"
                >
                  📚 지난 리포트
                </button>
              </div>
            </header>

            <WeeklyBriefHistory limit={5} refreshKey={refreshKey} />

            <WeeklyBriefGenerateCTA
              gate={gate}
              gateLoading={gateLoading}
              onSuccess={onGenerateSuccess}
            />
          </>
        )}
      </article>
      <WeeklyBriefHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentReportId={thisWeekReport?.id}
      />
    </div>
  );
}
