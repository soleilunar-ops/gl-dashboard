"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWeeklyBrief } from "@/lib/dashboard/weekly-brief/useWeeklyBriefList";
import { ReportSection } from "./ReportSection";
import { ReportSectionToc } from "./ReportSectionToc";
import { AskAboutReport } from "./AskAboutReport";
import { stripRef } from "@/lib/dashboard/weekly-brief/stripRef";
import "./weekly-brief.css";

const SECTION_TITLES: Record<string, string> = {
  orders: "§ 1. 주문 현황",
  hotpack_season: "§ 2. 핫팩 시즌 분석",
  offseason: "§ 2'. 비시즌 품목 분석",
  inventory: "§ 3. 총재고",
  import_leadtime: "§ 4. 수입 리드타임",
  milkrun: "§ 5. 쿠팡 밀크런",
  external: "§ 6. 외부 신호",
  noncompliance: "§ 7. 납품 미준수",
};

export function WeeklyBriefModal() {
  const params = useSearchParams();
  const router = useRouter();
  const reportId = params.get("brief");
  const contentRef = useRef<HTMLElement | null>(null);

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
              <div className="wr-header-badge">
                <span aria-hidden>📋</span>
                <span>주간 리포트</span>
              </div>
              {data && (
                <h2 className="wr-header-title" style={{ marginTop: 4 }}>
                  {data.parsed.metadata.week_start} ~ {data.parsed.metadata.week_end}
                </h2>
              )}
            </div>
            <button
              type="button"
              className="wr-modal-close"
              onClick={() => router.back()}
              aria-label="닫기"
            >
              ✕
            </button>
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
                    <h3 className="wr-section-title">🔍 이번 주 종합 인사이트</h3>
                    <button
                      type="button"
                      className="wr-section-tts"
                      onClick={() => {
                        /* insight TTS는 외부 AudioMiniPlayer 통해 별도 호출 */
                      }}
                      aria-label="인사이트 음성 재생"
                    >
                      🔊
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
                      reportId={data.id}
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
