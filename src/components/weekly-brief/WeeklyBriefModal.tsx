"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWeeklyBrief } from "@/lib/dashboard/weekly-brief/useWeeklyBriefList";
import { ReportSection } from "./ReportSection";
import { ReportSectionToc } from "./ReportSectionToc";
import { AskAboutReport } from "./AskAboutReport";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { stripRef } from "@/lib/dashboard/weekly-brief/stripRef";
import "./weekly-brief.css";

const SECTION_TITLES: Record<string, string> = {
  sales_highlight: "1. 이번 주 판매 하이라이트",
  weather_trigger: "2. 다음 주 날씨 · 트리거",
  transport: "3. 운송 현황",
};

export function WeeklyBriefModal() {
  const params = useSearchParams();
  const router = useRouter();
  const reportId = params.get("brief");
  const contentRef = useRef<HTMLElement | null>(null);
  const audio = useAudioPlayer();

  const { data, isLoading, error } = useWeeklyBrief(reportId);

  // ESC 닫기
  useEffect(() => {
    if (!reportId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reportId, router]);

  // body 스크롤 잠금
  useEffect(() => {
    if (!reportId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [reportId]);

  if (!reportId) return null;

  return (
    <div
      className="wr-root"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
    >
      <div
        className="wr-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="주간 리포트 상세"
        onClick={(e) => {
          if (e.target === e.currentTarget) router.back();
        }}
      >
        <div className="wr-modal">
          <div className="wr-modal-head">
            <div>
              <div
                className="wr-header-badge"
                style={{ background: "transparent", color: "#BBBF4E", padding: 0 }}
              >
                <span>주간 리포트</span>
              </div>
              {data && (
                <h2 className="wr-header-title" style={{ marginTop: 4 }}>
                  {data.parsed.metadata.week_start} ~ {data.parsed.metadata.week_end}
                </h2>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className="wr-modal-close"
                onClick={() => router.back()}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {isLoading && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--wr-muted)" }}>
              리포트를 불러오는 중...
            </div>
          )}
          {error && (
            <div style={{ padding: 32, textAlign: "center", color: "#B91C1C" }}>
              리포트를 표시할 수 없습니다. 새로 생성해 주세요.
            </div>
          )}

          {data && (
            <div className="wr-modal-body">
              <aside className="wr-modal-toc">
                <ReportSectionToc
                  sections={data.parsed.sections}
                  containerRef={contentRef as React.RefObject<HTMLElement | null>}
                />
              </aside>
              <article
                className="wr-modal-content"
                ref={contentRef as React.RefObject<HTMLElement>}
              >
                {/* 인사이트 섹션 먼저 */}
                <section id="section-insight" className="wr-section">
                  <header className="wr-section-head">
                    <h3 className="wr-section-title">이번 주 종합 인사이트</h3>
                    <button
                      type="button"
                      className={`wr-section-tts ${
                        audio.reportId === data.id && audio.section === "insight" && audio.isPlaying
                          ? "is-active"
                          : ""
                      }`}
                      onClick={() => {
                        if (
                          audio.reportId === data.id &&
                          audio.section === "insight" &&
                          audio.isPlaying
                        ) {
                          audio.pauseResume();
                        } else {
                          audio.play(data.id, "insight");
                        }
                      }}
                      aria-label="인사이트 음성 재생"
                    >
                      {audio.isLoading && audio.reportId === data.id && audio.section === "insight"
                        ? "⏳"
                        : audio.reportId === data.id &&
                            audio.section === "insight" &&
                            audio.isPlaying
                          ? "⏸"
                          : "🔊"}
                    </button>
                  </header>
                  <div className="wr-section-body">
                    <p style={{ fontWeight: 600, fontSize: 14 }}>
                      {stripRef(data.parsed.insight.headline)}
                    </p>
                    <p>{stripRef(data.parsed.insight.body)}</p>
                    <div style={{ marginTop: 12 }}>
                      <strong>주의사항</strong>
                      <ul>
                        {data.parsed.insight.alerts.map((a, i) => (
                          <li key={i}>{stripRef(a)}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>차주 주목</strong>
                      <ul>
                        {data.parsed.insight.next_week.map((n, i) => (
                          <li key={i}>{stripRef(n)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>

                {/* 1부 섹션들 */}
                {(Object.keys(SECTION_TITLES) as Array<keyof typeof SECTION_TITLES>).map((k) => {
                  const content = data.parsed.sections[k as keyof typeof data.parsed.sections];
                  if (!content) return null;
                  return (
                    <ReportSection
                      key={k}
                      sectionKey={k}
                      title={SECTION_TITLES[k]}
                      content={content}
                    />
                  );
                })}

                <AskAboutReport reportId={data.id} />
              </article>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
