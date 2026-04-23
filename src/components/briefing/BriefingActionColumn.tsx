"use client";

// 3열 — 체크리스트 + 검색량 + Insight(green)
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

  const maxBar = Math.max(...data.searchVolume.sparkline, 1);

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

      {/* 검색량 */}
      <div className="hb-divider-dotted">
        <div className="hb-divider-label">
          네이버 검색량 · {data.searchVolume.startDate} ~ {data.searchVolume.endDate}
        </div>
        <div className="hb-search-big">
          <div className="hb-search-num">
            <span className="hb-search-num-value">
              {data.searchVolume.dailyChangePercent > 0 ? "+" : ""}
              {data.searchVolume.dailyChangePercent}
            </span>
            <span className="hb-search-num-unit">%</span>
          </div>
          <span className="hb-search-label">전일 대비</span>
        </div>
        <div className="hb-sparkline">
          {data.searchVolume.sparkline.map((v, i) => (
            <div
              key={i}
              className="hb-sparkline-bar"
              style={{ height: `${(v / maxBar) * 100}%`, minHeight: 2 }}
            />
          ))}
        </div>
        <div className="hb-sparkline-axis">
          <span>{data.searchVolume.startDate.slice(5)}</span>
          <span>{data.searchVolume.endDate.slice(5)}</span>
        </div>
      </div>

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
