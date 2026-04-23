"use client";

// 2열 — Top3 게이지 + 물류 플로우(상해→인천→파주) + Insight(orange)
import { Fragment } from "react";
import type { SeasonProfile } from "@/lib/demo";

interface Props {
  data: SeasonProfile["inventory"];
}

function statusClass(status: "여유" | "적정" | "부족") {
  switch (status) {
    case "여유":
      return "hb-green";
    case "적정":
      return "hb-amber";
    case "부족":
      return "hb-red";
  }
}

function fillClass(percent: number) {
  if (percent >= 50) return "hb-green";
  if (percent >= 20) return "hb-amber";
  return "hb-red";
}

export function BriefingInventoryColumn({ data }: Props) {
  return (
    <section>
      <div className="hb-col-head">
        <span className="hb-col-title">재고</span>
        <span className="hb-col-meta">TOP 3 · GL / 쿠팡</span>
      </div>

      {/* Top3 게이지 */}
      <div style={{ marginBottom: 20 }}>
        {data.top3.map((item) => {
          const pill = statusClass(item.status);
          return (
            <div key={item.name} className="hb-gauge-item">
              <div className="hb-gauge-head">
                <span className="hb-gauge-name">{item.name}</span>
                <span className={`hb-pill ${pill}`}>{item.status}</span>
              </div>
              <div className="hb-gauge-line">
                <span className="hb-gauge-label">지엘</span>
                <div className="hb-gauge-track">
                  <div
                    className={`hb-gauge-fill ${fillClass(item.glPercent)}`}
                    style={{ width: `${item.glPercent}%` }}
                  />
                </div>
                <span className="hb-gauge-value">{item.glStock.toLocaleString()}</span>
              </div>
              <div className="hb-gauge-line">
                <span className="hb-gauge-label">쿠팡</span>
                <div className="hb-gauge-track">
                  <div
                    className={`hb-gauge-fill ${fillClass(item.coupangPercent)}`}
                    style={{ width: `${item.coupangPercent}%` }}
                  />
                </div>
                <span className={`hb-gauge-value ${item.status === "부족" ? "hb-red" : ""}`}>
                  {item.coupangStock.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 물류 흐름 */}
      <div className="hb-divider-dotted">
        <div className="hb-divider-label">물류 흐름</div>

        {data.inTransit && (
          <div className="hb-flow-block">
            <div className="hb-flow-stepper">
              {[1, 2, 3].map((step, idx) => {
                const active = data.inTransit!.currentStep === step;
                const done = data.inTransit!.currentStep > step;
                return (
                  <Fragment key={step}>
                    <div className="hb-flow-step">
                      <div
                        className={`hb-flow-dot ${active ? "hb-active" : done ? "hb-done" : "hb-inactive"}`}
                      />
                      <span
                        className={`hb-flow-label ${active ? "hb-active" : done ? "hb-done" : ""}`}
                      >
                        {["상해", "인천", "파주"][idx]}
                      </span>
                    </div>
                    {idx < 2 && (
                      <div className={`hb-flow-line ${done ? "hb-done" : "hb-pending"}`} />
                    )}
                  </Fragment>
                );
              })}
            </div>
            <div className="hb-flow-card" style={{ background: "#FEF7E0", padding: "14px 12px" }}>
              <div
                className="hb-flow-card-head"
                style={{ alignItems: "center", marginTop: 4, marginBottom: 6 }}
              >
                <div className="hb-flow-card-title">BL : {data.inTransit.contractNumber}</div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    background: "#F2BE5C",
                    color: "#5C3F00",
                  }}
                >
                  진행중
                </span>
              </div>
              <div className="hb-flow-card-date" style={{ textAlign: "right" }}>
                ETA {data.inTransit.pajuEta}
              </div>
            </div>
          </div>
        )}

        {data.arrivingToday && (
          <details className="hb-flow-arriving hb-flow-block">
            <summary className="hb-flow-arriving-summary">
              <div>
                <div className="hb-flow-card-title">
                  <span className="hb-flow-dot hb-done-final" />
                  오늘 도착 BL · {data.arrivingToday.blNumber}
                </div>
                <div className="hb-flow-card-body">
                  총 {data.arrivingToday.totalQuantity.toLocaleString()}개 ·{" "}
                  {data.arrivingToday.items.length}개 품목
                </div>
              </div>
              <svg
                className="hb-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>
            <div className="hb-flow-detail">
              {data.arrivingToday.items.map((it) => (
                <div key={it.name} className="hb-flow-detail-row">
                  <span>{it.name}</span>
                  <span>{it.quantity.toLocaleString()}개</span>
                </div>
              ))}
              <button type="button" className="hb-detail-btn">
                재포장 작업 시작
              </button>
            </div>
          </details>
        )}
      </div>

      {/* Insight — 아이콘·라벨 제거, 상품명 + 재고 잔여 표시 (#F2BE5C 기반) */}
      <div className="hb-insight" style={{ background: "#FEF7E0" }}>
        <p className="hb-insight-text">{data.top3[0]?.name ?? data.insight.headline}</p>
        <p className="hb-insight-sub">재고 {data.top3[0]?.coupangStock ?? 0}개 잔여.</p>
      </div>
    </section>
  );
}
