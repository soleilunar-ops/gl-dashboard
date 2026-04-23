"use client";

import { useEffect, useState } from "react";
import { HaruruCharacter } from "./HaruruCharacter";
import { TimeGreeting } from "./TimeGreeting";
import { ThermometerSearchBar } from "./ThermometerSearchBar";
import { FavoriteShortcuts } from "./FavoriteShortcuts";
import { HaruruConversation } from "@/components/haruru/HaruruConversation";
import { useHaruruAgent } from "@/components/haruru/useHaruruAgent";
import { useModelPicker } from "@/components/haruru/ModelPicker";
import { RecentSessions } from "@/components/haruru/RecentSessions";

/**
 * 대화 없음: 구글 홈처럼 중앙 정렬 (캐릭터 → 인사말 → 검색 → 최근 세션 → 즐겨찾기)
 * 대화 있음: 위 히어로 축소 → 대화 스크롤 영역 → 하단 고정 입력창
 */
export function HomeHero() {
  const { turns, streaming, ask, sendFeedback, reset, loadSession } = useHaruruAgent();
  const { model, setModel } = useModelPicker();
  const [refreshKey, setRefreshKey] = useState(0);
  const hasConversation = turns.length > 0;

  useEffect(() => {
    const pending = typeof window !== "undefined" && localStorage.getItem("haruru_pending_q");
    if (!pending) return;
    localStorage.removeItem("haruru_pending_q");
    ask(pending, model).then(() => setRefreshKey((k) => k + 1));
    // 초기 마운트 전용 단발 호출 — ask/model 변경 시 재실행할 필요 없음
  }, [ask, model]);

  const handleSearch = (q: string) => {
    if (!streaming && q) {
      ask(q, model).then(() => setRefreshKey((k) => k + 1));
    }
  };

  if (!hasConversation) {
    return (
      <div className="relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center overflow-hidden px-6 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-72 w-[42rem] max-w-full rounded-full bg-gradient-to-b from-[#FAE8B8]/50 via-[#FDF3D0]/40 to-transparent blur-3xl"
        />
        <div className="relative flex w-full max-w-2xl flex-col items-center gap-7">
          <HaruruCharacter />
          <TimeGreeting />
          <ThermometerSearchBar
            onSearch={handleSearch}
            model={model}
            onModelChange={setModel}
            modelDisabled={streaming}
          />
          <RecentSessions
            currentTurnsCount={turns.length}
            onLoad={loadSession}
            onNew={() => {
              reset();
              setRefreshKey((k) => k + 1);
            }}
            refreshKey={refreshKey}
          />
          <div className="mt-6">
            <FavoriteShortcuts />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mt-14 flex h-[calc(100vh-3.5rem)] w-full flex-col">
      {/* 대화 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          <HaruruConversation
            turns={turns}
            onFeedback={sendFeedback}
            onReset={() => {
              reset();
              setRefreshKey((k) => k + 1);
            }}
          />
        </div>
      </div>

      {/* 하단 고정 입력창 */}
      <div className="border-t border-gray-100 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
          <ThermometerSearchBar
            onSearch={handleSearch}
            model={model}
            onModelChange={setModel}
            modelDisabled={streaming}
          />
        </div>
      </div>
    </div>
  );
}
