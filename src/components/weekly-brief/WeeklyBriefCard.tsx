"use client";

// 07 v0.2 — 주간 리포트 메인 카드. 5 상태 머신 (A~E)
// A: 금주 리포트 존재 · B: 없음+월/금 · C: 없음+그외 · D: 2/2 도달 · E: 생성 중
//
// A/D: 헤드라인·주의사항·섹션 칩 + 하단 CTA (D는 비활성)
// B:   히스토리 + 주황 CTA 활성
// C:   히스토리 + 회색 비활성 버튼
// E:   CTA 내부에서 Progress 표시 (CTA 컴포넌트가 분기)

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useWeeklyBriefGate } from "@/lib/dashboard/weekly-brief/useWeeklyBriefGate";
import { useWeeklyBriefList } from "@/lib/dashboard/weekly-brief/useWeeklyBriefList";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { WeeklyBriefHeadline } from "./WeeklyBriefHeadline";
import { WeeklyBriefAlerts } from "./WeeklyBriefAlerts";
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
    // 생성 완료 토스트 — 올리브 그린 테마 (#BBBF4E 계열)
    toast.success("생성 완료!", {
      style: {
        background: "#BBBF4E",
        color: "#ffffff",
        border: "1px solid #A3A73E",
        fontWeight: 600,
      },
    });
  };

  // 상태 분기
  const hasReport = !!thisWeekReport;

  return (
    <div className="wr-root">
      <article className="wr-card">
        {hasReport ? (
          <>
            {/* 상태 A / D — 제목·날짜 가운데 좁은 간격, 버튼은 아래 우측 작게 */}
            <header
              className="wr-card-header"
              style={{
                flexDirection: "column",
                alignItems: "stretch",
                gap: 8,
                borderBottom: "none",
              }}
            >
              <div
                className="wr-header-badge"
                style={{
                  justifyContent: "center",
                  fontSize: 26,
                  fontWeight: 700,
                  background: "transparent",
                  color: "#BBBF4E",
                  padding: 0,
                  letterSpacing: "-0.01em",
                  margin: 0,
                }}
              >
                <span>주간 리포트</span>
              </div>
              <h2
                className="wr-header-title"
                style={{ fontSize: 26, margin: 0, textAlign: "center" }}
              >
                {thisWeekReport.parsed.metadata.week_start} ~{" "}
                {thisWeekReport.parsed.metadata.week_end}
              </h2>
              <div
                className="wr-header-actions wr-header-actions-sm"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <a href={`/dashboard?brief=${thisWeekReport.id}`} className="wr-btn wr-btn-sm">
                  전체 보기
                </a>
                <button
                  type="button"
                  className="wr-btn wr-btn-sm"
                  onClick={() => setHistoryOpen(true)}
                  aria-label="저장된 리포트 전체 보기"
                >
                  지난 리포트
                </button>
                <button
                  type="button"
                  className={`wr-btn wr-btn-sm ${
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
                    ? "생성 중..."
                    : audio.reportId === thisWeekReport.id &&
                        audio.section === "insight" &&
                        audio.isPlaying
                      ? "일시정지"
                      : "리포트 음성 보고"}
                </button>
              </div>
            </header>

            <div className="wr-two-col">
              <WeeklyBriefHeadline headline={thisWeekReport.parsed.insight.headline} />
              <WeeklyBriefAlerts alerts={thisWeekReport.parsed.insight.alerts} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "0 28px 12px",
              }}
            >
              <a
                href={`/dashboard?brief=${thisWeekReport.id}&ask=1`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--wr-primary-text)",
                  textDecoration: "none",
                }}
              >
                이 리포트에 대해 질문하기 →
              </a>
            </div>
            <WeeklyBriefGenerateCTA
              gate={gate}
              gateLoading={gateLoading}
              onSuccess={onGenerateSuccess}
            />
          </>
        ) : (
          <>
            {/* 상태 B / C / E */}
            <header
              className="wr-card-header"
              style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}
            >
              <div className="wr-header-main" style={{ textAlign: "center" }}>
                <div
                  className="wr-header-badge"
                  style={{
                    justifyContent: "center",
                    fontSize: 26,
                    fontWeight: 700,
                    background: "transparent",
                    color: "#BBBF4E",
                    padding: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span>주간 리포트</span>
                </div>
                <h2
                  className="wr-header-title"
                  style={{ fontSize: 26, textAlign: "center", marginTop: 6 }}
                >
                  이번 주 리포트를 생성해 보세요
                </h2>
              </div>
              <div
                className="wr-header-actions"
                style={{ justifyContent: "flex-end", alignSelf: "flex-end" }}
              >
                <button
                  type="button"
                  className="wr-btn"
                  onClick={() => setHistoryOpen(true)}
                  aria-label="저장된 리포트 전체 보기"
                >
                  지난 리포트
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
