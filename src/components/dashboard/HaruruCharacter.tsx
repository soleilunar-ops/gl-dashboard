"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Lottie는 브라우저 전용 — SSR 제외
const Lottie = dynamic(() => import("lottie-react").then((m) => m.default), {
  ssr: false,
});

interface HaruruCharacterProps {
  /** lottie JSON 파일 경로 (public 기준). 없거나 404면 자동으로 이모지 폴백 */
  src?: string;
  size?: number;
}

/** 프로젝트 마스코트 '하루루'. Lottie JSON 연결 전까지는 🔥 폴백 */
export function HaruruCharacter({ src = "/lottie/haruru.json", size = 180 }: HaruruCharacterProps) {
  const [animationData, setAnimationData] = useState<unknown | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`lottie ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setAnimationData(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed || !animationData) {
    // lottie 파일이 아직 없을 때의 폴백 — 부드러운 바운스 불꽃
    return (
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        aria-label="하루루 캐릭터"
      >
        <div className="absolute inset-2 rounded-full bg-gradient-to-b from-orange-100 via-orange-50 to-transparent blur-xl" />
        <span
          className="relative animate-bounce select-none"
          style={{ fontSize: size * 0.55, lineHeight: 1 }}
        >
          🔥
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size }}>
      <Lottie animationData={animationData} loop autoplay />
    </div>
  );
}
