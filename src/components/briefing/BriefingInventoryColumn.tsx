"use client";

// 2열 — Top3 게이지 + 물류 플로우(상해→인천→파주) + Insight(orange)
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
        <span className="hb-col-title">Inventory</span>
        <span className="hb-col-meta">TOP 3 · 지엘 / 쿠팡</span>
      </div>

      {/* Top3 게이지 */}
      <div style={{ marginBottom: 20 }}>
        {data.top3.map((item) => {
          const pill = statusClass(item.status);
          return (
            <div key={item.name} className="hb-gauge-item">
              <div className="hb-gauge-head">
                <div>
                  <span className="hb-gauge-name">{item.name}</span>
                  <span className="hb-gauge-spec">{item.spec}</span>
                  {item.approximate && (
                    <span className="hb-gauge-spec" title="매핑 불일치 · 근사치">
                      ≈
                    </span>
                  )}
                </div>
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

      {/* 물류 플로우 */}
      <div className="hb-divider-dotted">
        <div className="hb-divider-label">물류 플로우</div>

        {data.inTransit && (
          <div className="hb-flow-block">
            <div className="hb-flow-stepper">
              {[1, 2, 3].map((step, idx) => {
                const active = data.inTransit!.currentStep === step;
                const done = data.inTransit!.currentStep > step;
                return (
                  <>
                    <div key={`s-${step}`} className="hb-flow-step">
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
                      <div
                        key={`l-${step}`}
                        className={`hb-flow-line ${done ? "hb-done" : "hb-pending"}`}
                      />
                    )}
                  </>
                );
              })}
            </div>
            <div className="hb-flow-card">
              <div className="hb-flow-card-head">
                <div className="hb-flow-card-title">
                  진행 중 BL · {data.inTransit.contractNumber}
                </div>
                <div className="hb-flow-card-date">ETA {data.inTransit.pajuEta}</div>
              </div>
              <div className="hb-flow-card-body">
                <span>{data.inTransit.from} → 파주</span>
                <span className="hb-flow-divider">·</span>
                <span>{data.inTransit.quantity.toLocaleString()}개</span>
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

      {/* Insight */}
      <div className="hb-insight hb-orange">
        <div className="hb-insight-head">
          <svg
            className="hb-insight-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              strokeLinejoin="round"
            />
          </svg>
          <span className="hb-insight-label">Insight</span>
        </div>
        <p className="hb-insight-text">{data.insight.headline}</p>
        <p className="hb-insight-sub">{data.insight.sub}</p>
      </div>
    </section>
  );
}
