"use client";

import { stripRef } from "@/lib/dashboard/weekly-brief/stripRef";

interface Props {
  alerts: string[];
}

export function WeeklyBriefAlerts({ alerts }: Props) {
  if (!alerts?.length) return null;
  return (
    <div className="wr-alerts">
      <div className="wr-alerts-head">
        <span className="wr-alerts-label">주의사항 {alerts.length}건</span>
      </div>
      <ul className="wr-alerts-list">
        {alerts.map((a, i) => (
          <li key={i}>{stripRef(a)}</li>
        ))}
      </ul>
    </div>
  );
}
