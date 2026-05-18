"use client";

// 3열 — 체크리스트 + Insight(green)
// 변경 이유(2026-05-18): 네이버 검색량 카드는 sync-keyword-trends Edge Function 미가동·미배포 상태라 라이브 데이터 없음. UI에서 숨김(코드는 git에 보존)
import { useState } from "react";
import type { SeasonProfile } from "@/lib/demo";

interface Props {
  data: SeasonProfile["action"];
}

function tagClass(tag: "긴급" | "오늘" | "이번주") {
  switch (tag) {
    case "긴급":
      return "hb-red";
    case "오늘":
      return "hb-amber";
    case "이번주":
      return "hb-slate";
  }
}

export function BriefingActionColumn({ data }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <section>
      <div className="hb-col-head">
        <span className="hb-col-title">Action</span>
        <span className="hb-col-meta">{data.tasks.length}건 · 금주 액션</span>
      </div>

      {/* 체크리스트 */}
      <div className="hb-tasks">
        {data.tasks.map((t) => (
          <label key={t.id} className="hb-task-item">
            <input
              type="checkbox"
              className="hb-checkbox"
              checked={!!checked[t.id]}
              onChange={(e) => setChecked((p) => ({ ...p, [t.id]: e.target.checked }))}
            />
            <div className="hb-task-body">
              <div className="hb-task-title">{t.title}</div>
              <div className="hb-task-desc">{t.description}</div>
            </div>
            <span className={`hb-tag ${tagClass(t.tag)}`}>{t.tag}</span>
          </label>
        ))}
      </div>

      {/* 검색량 영역은 일시 숨김 (네이버 DataLab 연동 미가동) */}

      {/* Insight */}
      <div className="hb-insight hb-green">
        <div className="hb-insight-head">
          <svg
            className="hb-insight-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 3v18h18M7 12l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hb-insight-label">Insight</span>
        </div>
        <p className="hb-insight-text">{data.insight.headline}</p>
        <p className="hb-insight-sub">{data.insight.sub}</p>
      </div>
    </section>
  );
}
