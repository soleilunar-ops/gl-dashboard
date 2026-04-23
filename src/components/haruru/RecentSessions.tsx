"use client";

import { useEffect, useState } from "react";
import { History, Plus } from "lucide-react";
import { fetchRecentSessions, type HaruruRecentSession } from "./useHaruruAgent";

interface RecentSessionsProps {
  currentTurnsCount: number;
  onLoad: (sessionId: string) => void;
  onNew: () => void;
  refreshKey?: number; // 바뀌면 재조회
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function RecentSessions({
  currentTurnsCount,
  onLoad,
  onNew,
  refreshKey,
}: RecentSessionsProps) {
  const [sessions, setSessions] = useState<HaruruRecentSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentSessions(10)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return null;
  if (sessions.length === 0 && currentTurnsCount === 0) return null;

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <History className="h-3.5 w-3.5" />
          <span>최근 대화</span>
        </div>
        {currentTurnsCount > 0 && (
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1 rounded border border-orange-200 bg-white px-2 py-0.5 text-xs text-orange-600 hover:bg-orange-50"
          >
            <Plus className="h-3 w-3" />새 대화
          </button>
        )}
      </div>
      {sessions.length > 0 ? (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {sessions.map((s) => (
            <li key={s.session_id}>
              <button
                type="button"
                onClick={() => onLoad(s.session_id)}
                className="flex w-full items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 hover:border-orange-300 hover:bg-orange-50"
              >
                <span className="line-clamp-1 flex-1 pr-2">{s.title ?? "(제목 없음)"}</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {formatTime(s.last_active_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400">아직 대화 이력이 없어요.</p>
      )}
    </div>
  );
}
