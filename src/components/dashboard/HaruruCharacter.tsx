"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useHaruruWeather, type HaruruState } from "./_hooks/useHaruruWeather";

// Lottie는 브라우저 전용 — SSR 제외
const Lottie = dynamic(() => import("lottie-react").then((m) => m.default), {
  ssr: false,
});

// 날씨 상태별 Lottie 파일 경로 (public/ 기준)
// 참고: "구름 많음"은 Lottie 없이 PNG만 사용하므로 여기서 제외
const LOTTIE_PATH: Partial<Record<HaruruState, string>> = {
  해: "/lottie/해.json",
  흐림: "/lottie/흐림.json",
  비: "/lottie/비.json",
  눈: "/lottie/눈.json",
  바람: "/lottie/바람.json",
  더움: "/lottie/더움.json",
  추움: "/lottie/추움.json",
};

// 구름 많음 전용 PNG (구름 한 조각 위에서 둥둥 떠있는 컷)
const CLOUDY_PNG = "/구름 많음.png";
// 로딩/실패/default 폴백 PNG
const DEFAULT_PNG = "/하루루 기본.png";

interface HaruruCharacterProps {
  size?: number;
}

/** 사용자 위치 날씨에 따라 하루루 모습을 표시 (해/구름 많음/흐림/비/눈/바람/더움/추움/default) */
export function HaruruCharacter({ size = 180 }: HaruruCharacterProps) {
  const { state, loaded } = useHaruruWeather();
  const [animationData, setAnimationData] = useState<unknown | null>(null);
  const [lottieFailed, setLottieFailed] = useState(false);
  const [pngFailed, setPngFailed] = useState(false);

  useEffect(() => {
    setAnimationData(null);
    setLottieFailed(false);
    if (!loaded) return;

    const path = LOTTIE_PATH[state];
    if (!path) return; // default / 구름 많음 은 Lottie 로드 안 함

    let cancelled = false;
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`lottie ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setAnimationData(json);
      })
      .catch(() => {
        if (!cancelled) setLottieFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, state]);

  // 구름 많음: Lottie 없이 PNG 한 장을 animate-bounce 로 렌더 (실패 시 기본 PNG 폴백)
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

  // 로딩 중 / default / Lottie 로드 실패 → 하루루 기본.png (둥둥)
  const showDefaultPng = !loaded || state === "default" || lottieFailed || !animationData;

  if (showDefaultPng) {
    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        aria-label="하루루 캐릭터"
      >
        <div className="absolute inset-2 rounded-full bg-gradient-to-b from-[#FAE8B8] via-[#FDF3D0] to-transparent blur-xl" />
        {pngFailed ? (
          // PNG마저 없으면 이모지 폴백
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

  return (
    <div style={{ width: size, height: size }} aria-label="하루루 캐릭터">
      <Lottie animationData={animationData} loop autoplay />
    </div>
  );
}
