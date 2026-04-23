"use client";

import { useEffect, useState } from "react";
import { History, Plus, X } from "lucide-react";
import { deleteSession, fetchRecentSessions, type HaruruRecentSession } from "./useHaruruAgent";

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
            <li key={s.session_id} className="group relative">
              <button
                type="button"
                onClick={() => onLoad(s.session_id)}
                className="flex w-full items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 pr-9 text-left text-xs text-gray-700 hover:border-orange-300 hover:bg-orange-50"
              >
                <span className="line-clamp-1 flex-1 pr-2">{s.title ?? "(제목 없음)"}</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {formatTime(s.last_active_at)}
                </span>
              </button>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm("이 대화를 삭제하시겠습니까?")) return;
                  try {
                    await deleteSession(s.session_id);
                    setSessions((prev) => prev.filter((x) => x.session_id !== s.session_id));
                  } catch (err) {
                    alert(
                      "삭제에 실패했습니다: " + (err instanceof Error ? err.message : String(err))
                    );
                  }
                }}
                aria-label="대화 삭제"
                className="absolute top-1/2 right-2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-400 ring-1 ring-gray-200 transition-colors group-hover:flex hover:text-red-500"
              >
                <X className="h-3 w-3" />
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
