"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  fetchRecentSessions,
  deleteRecentSession,
  type HaruruRecentSession,
} from "./useHaruruAgent";

interface RecentSessionsProps {
  /** 토글 상태 — true일 때만 목록 렌더 */
  open: boolean;
  /** 세션 클릭 시 재생 */
  onLoad: (sessionId: string) => void;
  /** 바뀌면 세션 리스트 재조회 */
  refreshKey?: number;
  /** 표시할 최대 개수 */
  maxItems?: number;
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

export function RecentSessions({ open, onLoad, refreshKey, maxItems = 4 }: RecentSessionsProps) {
  const [sessions, setSessions] = useState<HaruruRecentSession[]>([]);
  const [loading, setLoading] = useState(false);

  // 표시는 maxItems개지만, 실제로는 버퍼로 더 받아둠 → 삭제 시 다음 세션이 자동으로 자리 채움
  const BUFFER_MULTIPLIER = 5;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchRecentSessions(Math.max(maxItems * BUFFER_MULTIPLIER, 20))
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [open, refreshKey, maxItems]);

  // 삭제: 낙관적으로 UI 먼저 제거 → 실패 시 재조회로 복구
  const handleDelete = async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== id));
    try {
      await deleteRecentSession(id);
    } catch (e) {
      console.error("세션 삭제 실패:", e);
      fetchRecentSessions(Math.max(maxItems * BUFFER_MULTIPLIER, 20)).then(setSessions);
    }
  };

  if (!open) return null;
  if (loading) return null;

  // 실제 화면에는 maxItems개만 표시 (나머지는 삭제 시 보충용 버퍼)
  const visible = sessions.slice(0, maxItems);

  return (
    <div className="w-full max-w-2xl">
      {visible.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((s) => (
            <li key={s.session_id} className="group/session relative">
              <button
                type="button"
                onClick={() => onLoad(s.session_id)}
                className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-left text-xs text-gray-700 hover:border-orange-300 hover:bg-orange-50"
              >
                <span className="line-clamp-1 flex-1 pr-2">{s.title ?? "(제목 없음)"}</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {formatTime(s.last_active_at)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(s.session_id);
                }}
                aria-label="이 대화 삭제"
                className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 opacity-0 transition-opacity group-hover/session:opacity-100 hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
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
