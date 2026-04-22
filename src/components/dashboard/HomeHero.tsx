"use client";

import { HaruruCharacter } from "./HaruruCharacter";
import { TimeGreeting } from "./TimeGreeting";
import { ThermometerSearchBar } from "./ThermometerSearchBar";
import { FavoriteShortcuts } from "./FavoriteShortcuts";

/** 구글 홈처럼 가운데 정렬: 캐릭터 → 온도계 검색창 → 즐겨찾기 바로가기 */
export function HomeHero() {
  return (
    <div className="relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center overflow-hidden px-6 py-10">
      {/* 살짝 깔리는 배경 글로우 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-72 w-[42rem] max-w-full rounded-full bg-gradient-to-b from-[#FAE8B8]/50 via-[#FDF3D0]/40 to-transparent blur-3xl"
      />

      <div className="relative flex w-full max-w-2xl flex-col items-center gap-7">
        <HaruruCharacter />
        <TimeGreeting />
        <ThermometerSearchBar />
        <div className="mt-6">
          <FavoriteShortcuts />
        </div>
      </div>
    </div>
  );
}
