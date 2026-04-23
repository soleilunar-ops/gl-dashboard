"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { HaruruCharacter } from "./HaruruCharacter";
import { TimeGreeting } from "./TimeGreeting";
import { ThermometerSearchBar } from "./ThermometerSearchBar";
import { FavoriteShortcuts } from "./FavoriteShortcuts";
import { HaruruConversation } from "@/components/haruru/HaruruConversation";
import { useHaruruAgent } from "@/components/haruru/useHaruruAgent";
import { useModelPicker } from "@/components/haruru/ModelPicker";
import { RecentSessions } from "@/components/haruru/RecentSessions";

/**
 * 홈 화면 구성:
 *  캐릭터 → 인사말 → 온도계 검색(돋보기=모델선택 / 20°C옆=최근대화 토글)
 *    → 즐겨찾기 → 검색 답변(있을 때) → 최근 대화 목록(토글 시)
 */
export function HomeHero() {
  const { turns, streaming, ask, sendFeedback, reset, loadSession } = useHaruruAgent();
  const { model, setModel } = useModelPicker();
  const [refreshKey, setRefreshKey] = useState(0);
  const [recentOpen, setRecentOpen] = useState(false);
  const hasConversation = turns.length > 0;

  useEffect(() => {
    const pending = typeof window !== "undefined" && localStorage.getItem("haruru_pending_q");
    if (!pending) return;
    localStorage.removeItem("haruru_pending_q");
    ask(pending, model).then(() => setRefreshKey((k) => k + 1));
    // 초기 마운트 전용 단발 호출 — ask/model 변경 시 재실행할 필요 없음
  }, [ask, model]);

  return (
    <div
      className={
        hasConversation
          ? "relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center overflow-y-auto px-6 py-10"
          : "relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center overflow-hidden px-6 pt-10 pb-32"
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-72 w-[42rem] max-w-full rounded-full bg-gradient-to-b from-[#FAE8B8]/50 via-[#FDF3D0]/40 to-transparent blur-3xl"
      />

      <div className="relative flex w-full max-w-2xl flex-col items-center gap-7">
        <HaruruCharacter />
        <TimeGreeting />
        <ThermometerSearchBar
          model={model}
          onModelChange={setModel}
          modelDisabled={streaming}
          onSearch={(q) => {
            if (!streaming && q) {
              ask(q, model).then(() => setRefreshKey((k) => k + 1));
            }
          }}
          toolbarSlot={
            <button
              type="button"
              onClick={() => setRecentOpen((v) => !v)}
              aria-expanded={recentOpen}
              className="flex h-6 cursor-pointer items-center gap-1 rounded-full border border-[#F9DB94] bg-[#FDF3D0] px-2.5 text-[11px] font-medium text-[#8A6A1F] hover:bg-[#FAE8B8]"
            >
              <History className="h-3 w-3" />
              최근 대화
            </button>
          }
        />

        <FavoriteShortcuts />

        {/* 검색 답변 — 바로가기 아래로 */}
        {hasConversation && (
          <HaruruConversation
            turns={turns}
            onFeedback={sendFeedback}
            onReset={() => {
              reset();
              setRefreshKey((k) => k + 1);
            }}
          />
        )}

        {/* 최근 대화 목록 — 버튼 클릭 시에만, 최대 4개 */}
        <RecentSessions
          open={recentOpen}
          maxItems={4}
          onLoad={(id) => {
            loadSession(id);
            setRecentOpen(false);
          }}
          refreshKey={refreshKey}
        />
      </div>
    </div>
  );
}
