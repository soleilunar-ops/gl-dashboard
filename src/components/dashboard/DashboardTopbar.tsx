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
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">오늘의 하루루 브리핑</h1>
        </div>
      </div>
      <div className="dashboard-topbar-actions">
        <button
          type="button"
          className="dashboard-topbar-btn"
          onClick={() => window.location.reload()}
          title="페이지를 새로고침하여 최신 데이터를 다시 불러옵니다"
        >
          ↻ 새로고침 {hhmm && `· ${hhmm}`}
        </button>
      </div>
    </header>
  );
}
