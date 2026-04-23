"use client";

import { useEffect, useState } from "react";

export function DashboardTopbar() {
  const [hhmm, setHhmm] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      setHhmm(`${h}:${m}`);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-topbar-left">
        <span className="dashboard-fire" aria-hidden>
          🔥
        </span>
        <div>
          <h1 className="dashboard-title">오늘의 하루루 브리핑</h1>
          <p className="dashboard-subtitle">매일 아침 6시 · 쿠팡 50억+ 시즌 전용 대시보드</p>
        </div>
      </div>
      <div className="dashboard-topbar-actions">
        <button type="button" className="dashboard-topbar-btn">
          ↻ 새로고침 {hhmm && `· ${hhmm}`}
        </button>
        <button type="button" className="dashboard-topbar-btn">
          ⚙ 설정
        </button>
      </div>
    </header>
  );
}
