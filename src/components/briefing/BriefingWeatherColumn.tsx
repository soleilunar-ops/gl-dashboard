"use client";

// 1열 — 기온·강수 6칸·트리거·Insight(blue)
import type { SeasonProfile } from "@/lib/demo";

interface Props {
  data: SeasonProfile["weather"];
}

function weatherIcon(desc: string) {
  if (desc.includes("맑음") && desc.includes("바람")) {
    return (
      <svg
        className="hb-weather-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F97316"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="4" fill="#F97316" fillOpacity="0.15" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (desc.includes("맑음")) {
    return (
      <svg
        className="hb-weather-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="5" fill="#F59E0B" fillOpacity="0.2" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (desc.includes("비")) {
    return (
      <svg
        className="hb-weather-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" fill="#DBEAFE" />
        <line x1="8" y1="19" x2="8" y2="21" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="16" y1="19" x2="16" y2="21" />
      </svg>
    );
  }
  if (desc.includes("구름")) {
    return (
      <svg
        className="hb-weather-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#64748B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.5 19a4.5 4.5 0 1 0-1.41-8.78 7 7 0 1 0-11.1 7.78z" fill="#E2E8F0" />
      </svg>
    );
  }
  return (
    <svg
      className="hb-weather-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#64748B"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function BriefingWeatherColumn({ data }: Props) {
  const maxPct = Math.max(...data.precipitation.map((p) => p.percent), 10);

  return (
    <section>
      <div className="hb-col-head">
        <span className="hb-col-title">Weather</span>
        <span className="hb-col-meta">
          {data.location} · {data.latitude}°N
        </span>
      </div>

      {/* 기온 */}
      <div className="hb-weather-temp-row">
        <div>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span className="hb-weather-temp-num">{data.tempC}</span>
            <span className="hb-weather-temp-unit">°</span>
          </div>
          <p className="hb-weather-desc">
            {data.description} · 체감 {data.feelsLikeC}°
          </p>
        </div>
        {weatherIcon(data.description)}
      </div>

      {/* 강수 6칸 */}
      <div className="hb-precip-section">
        <div className="hb-precip-head">
          <span className="hb-precip-label">시간대별 강수확률</span>
          <span className="hb-precip-value">최대 {maxPct}%</span>
        </div>
        <div className="hb-precip-grid">
          {data.precipitation.map((p) => {
            const isMax = p.percent === maxPct;
            const h = Math.max(6, (p.percent / 100) * 100);
            return (
              <div key={p.hour} className="hb-precip-col">
                <div
                  className={`hb-precip-bar ${isMax ? "hb-active" : ""}`}
                  style={{ height: `${h}%` }}
                />
                <span className={`hb-precip-hour ${isMax ? "hb-active" : ""}`}>{p.hour}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 트리거 */}
      <div className="hb-divider-dotted">
        <div className="hb-divider-label">시즌 트리거</div>
        <div className="hb-trigger-row">
          <span className="hb-trigger-label">전일 대비 기온차</span>
          <span className="hb-trigger-value">
            {data.triggers.tempDiffFromYesterday > 0 ? "+" : ""}
            {data.triggers.tempDiffFromYesterday.toFixed(1)}°
          </span>
        </div>
        <div className="hb-trigger-row">
          <span className="hb-trigger-label">시즌 첫 영하일</span>
          <span className="hb-trigger-value">{data.triggers.firstSubzeroDate ?? "미기록"}</span>
        </div>
        <div className="hb-trigger-row">
          <span className="hb-trigger-label">전년 대비</span>
          <span className="hb-trigger-value">
            {data.triggers.daysEarlierThanLastYear === 0
              ? "동일"
              : `${Math.abs(data.triggers.daysEarlierThanLastYear)}일 ${data.triggers.daysEarlierThanLastYear < 0 ? "빠름" : "늦음"}`}
          </span>
        </div>
      </div>

      {/* Insight */}
      <div className="hb-insight hb-blue">
        <div className="hb-insight-head">
          <svg
            className="hb-insight-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a10 10 0 1 0 10 10" strokeLinecap="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="hb-insight-label">Insight</span>
        </div>
        <p className="hb-insight-text">{data.insight.headline}</p>
        <p className="hb-insight-sub">{data.insight.sub}</p>
      </div>
    </section>
  );
}
