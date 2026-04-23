"use client";

// 08 v0.4 — 하루루 브리핑 카드. DB에서 실시간 데이터 조회.
// useBriefingData 훅이 날씨·재고·액션을 병합해서 SeasonProfile 형태로 반환.
import { useBriefingData } from "@/components/dashboard/_hooks/useBriefingData";
import { BriefingHeader } from "./BriefingHeader";
import { BriefingWeatherColumn } from "./BriefingWeatherColumn";
import { BriefingInventoryColumn } from "./BriefingInventoryColumn";
import { BriefingActionColumn } from "./BriefingActionColumn";
import "./briefing.css";

export function BriefingCard() {
  const { profile, loading, error } = useBriefingData();

  if (loading) {
    return (
      <div className="hb-root">
        <article className="hb-card" style={{ padding: 32, textAlign: "center", opacity: 0.5 }}>
          브리핑 데이터를 불러오는 중...
        </article>
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="hb-root">
        <article className="hb-card" style={{ padding: 32, textAlign: "center", color: "#B91C1C" }}>
          브리핑 데이터를 불러오지 못했습니다. {error}
        </article>
      </div>
    );
  }

  return (
    <div className="hb-root">
      <article className="hb-card">
        <BriefingHeader header={profile.header} />

        <div className="hb-body-3col">
          <BriefingWeatherColumn data={profile.weather} />
          <BriefingInventoryColumn data={profile.inventory} />
          <BriefingActionColumn data={profile.action} />
        </div>
      </article>
    </div>
  );
}
