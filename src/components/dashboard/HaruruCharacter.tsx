"use client";

import { useState } from "react";
import PngSequencePlayer from "@/components/shared/PngSequencePlayer";
import { useHaruruWeather } from "./_hooks/useHaruruWeather";
import { MASCOT_FRAMES, MASCOT_DURATION, isSequenceState } from "./mascotFrames";

// 단일 이미지 경로 (시퀀스 아닌 두 상태용)
const CLOUDY_PNG = "/mascot/구름많음.png";
const DEFAULT_PNG = "/mascot/기본.png";

interface HaruruCharacterProps {
  size?: number;
}

/**
 * 사용자 위치 날씨에 따라 하루루 모습을 표시.
 *  - 해/흐림/비/눈/바람/더움/추움 → PNG 시퀀스 재생 (mascotFrames.ts 참조)
 *  - 구름 많음 / default(로딩·실패) → 단일 PNG + animate-bounce
 */
export function HaruruCharacter({ size = 220 }: HaruruCharacterProps) {
  const { state, loaded } = useHaruruWeather();
  const [pngFailed, setPngFailed] = useState(false);

  // 구름 많음: 단일 PNG bounce
  if (loaded && state === "구름 많음" && !pngFailed) {
    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        aria-label="하루루 캐릭터 (구름 많음)"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CLOUDY_PNG}
          alt="하루루 구름 많음"
          className="relative animate-bounce select-none"
          style={{ width: size * 0.9, height: size * 0.9, objectFit: "contain" }}
          onError={() => setPngFailed(true)}
        />
      </div>
    );
  }

  // 로딩 전 / default / PNG 로드 실패 → 기본 PNG bounce (따뜻한 글로우 배경)
  if (!loaded || state === "default" || pngFailed || !isSequenceState(state)) {
    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        aria-label="하루루 캐릭터"
      >
        <div className="absolute inset-2 rounded-full bg-gradient-to-b from-[#FAE8B8] via-[#FDF3D0] to-transparent blur-xl" />
        {pngFailed ? (
          <span
            className="relative animate-bounce select-none"
            style={{ fontSize: size * 0.55, lineHeight: 1 }}
          >
            🔥
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={DEFAULT_PNG}
            alt="하루루"
            className="relative animate-bounce select-none"
            style={{ width: size * 0.8, height: size * 0.8, objectFit: "contain" }}
            onError={() => setPngFailed(true)}
          />
        )}
      </div>
    );
  }

  // 시퀀스 재생 대상 날씨 상태 (7종)
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`하루루 캐릭터 (${state})`}
    >
      <div className="absolute inset-2 rounded-full bg-gradient-to-b from-[#FAE8B8] via-[#FDF3D0] to-transparent blur-xl" />
      <PngSequencePlayer
        frames={MASCOT_FRAMES[state]}
        size={Math.floor(size * 0.9)}
        duration={MASCOT_DURATION[state]}
        className="relative"
      />
    </div>
  );
}
