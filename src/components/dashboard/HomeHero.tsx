"use client";

import { HaruruCharacter } from "./HaruruCharacter";
import { ThermometerSearchBar } from "./ThermometerSearchBar";
import { FavoriteShortcuts } from "./FavoriteShortcuts";
import { HaruruConversation } from "@/components/haruru/HaruruConversation";
import { useHaruruAgent } from "@/components/haruru/useHaruruAgent";

/** 구글 홈처럼 가운데 정렬: 캐릭터 → 온도계 검색창(하루루) → 대화 누적 → 즐겨찾기 */
export function HomeHero() {
  const { turns, streaming, ask, sendFeedback } = useHaruruAgent();
  const hasConversation = turns.length > 0;

  return (
    <div
      className={
        hasConversation
          ? "relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center overflow-y-auto px-6 py-10"
          : "relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center overflow-hidden px-6 py-10"
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-72 w-[42rem] max-w-full rounded-full bg-gradient-to-b from-orange-100/60 via-orange-50/40 to-transparent blur-3xl"
      />

      <div className="relative flex w-full max-w-2xl flex-col items-center gap-7">
        <HaruruCharacter />
        <ThermometerSearchBar
          onSearch={(q) => {
            if (!streaming && q) ask(q);
          }}
        />

        {hasConversation && <HaruruConversation turns={turns} onFeedback={sendFeedback} />}

        <div className="mt-6">
          <FavoriteShortcuts />
        </div>
      </div>
    </div>
  );
}
