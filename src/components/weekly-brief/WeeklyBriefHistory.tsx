"use client";

import Link from "next/link";
import { useWeeklyBriefList } from "@/lib/dashboard/weekly-brief/useWeeklyBriefList";

function weekLabel(weekStart: string): string {
  // YYYY-MM-DD → "MM/DD"
  const d = new Date(weekStart + "T00:00:00Z");
  if (isNaN(d.getTime())) return weekStart;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

interface Props {
  limit?: number;
  refreshKey?: number;
}

export function WeeklyBriefHistory({ limit = 5, refreshKey = 0 }: Props) {
  const { data, isLoading } = useWeeklyBriefList(limit, refreshKey);

  if (isLoading && data.length === 0) return null;
  if (!isLoading && data.length === 0) return null;

  return (
    <div className="wr-history">
      <div className="wr-history-label">최근 리포트</div>
      <ul className="wr-history-list">
        {data.map((r) => {
          const wstart = r.parsed?.metadata?.week_start ?? r.generated_at.slice(0, 10);
          return (
            <li key={r.id} className="wr-history-item">
              <Link href={`/dashboard?brief=${r.id}`} className="wr-history-link">
                {weekLabel(wstart)}부터 · {r.parsed?.insight?.headline?.slice(0, 40) ?? "리포트"}
              </Link>
              <span className="wr-history-date">{formatKoreanDate(r.generated_at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
