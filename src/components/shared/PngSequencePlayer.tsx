"use client";

import { useEffect, useId, useMemo } from "react";
import { cn } from "@/lib/utils";

interface PngSequencePlayerProps {
  /** 재생할 PNG 경로 배열 (순서대로 재생) */
  frames: string[];
  /** 한 변의 크기(px). 정사각형으로 렌더됨 */
  size?: number;
  /** 한 사이클 재생 시간(초) */
  duration?: number;
  /** 추가 Tailwind 클래스 */
  className?: string;
}

/**
 * PNG 시퀀스를 영상처럼 무한 재생하는 컴포넌트.
 *
 * - background-image + CSS steps()로 프레임 스위칭
 * - 첫 렌더 시 모든 프레임을 preload → 초기 깜빡임/끊김 방지
 * - 배경 투명 유지 (bg-transparent)
 */
export default function PngSequencePlayer({
  frames,
  size = 200,
  duration = 1,
  className,
}: PngSequencePlayerProps) {
  // SSR-안전한 고유 keyframe 이름 (같은 페이지에 여러 개 있어도 충돌 없음)
  const rawId = useId();
  const animName = `png-seq-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  // frames 배열 기반으로 @keyframes 문자열 동적 생성
  // background-image는 interpolation이 안 되는 discrete 속성이라
  // 각 구간 시작점에 키프레임을 박아두면 해당 구간 내내 그 이미지가 유지됨
  const keyframesCss = useMemo(() => {
    if (frames.length === 0) return "";
    const steps = frames.map((src, i) => {
      const pct = ((i / frames.length) * 100).toFixed(4);
      return `  ${pct}% { background-image: url("${src}"); }`;
    });
    return `@keyframes ${animName} {\n${steps.join("\n")}\n}`;
  }, [frames, animName]);

  // 모든 프레임을 브라우저 캐시에 미리 로드
  useEffect(() => {
    const imgs = frames.map((src) => {
      const img = new window.Image();
      img.src = src;
      return img;
    });
    return () => {
      // 언마운트 시 참조 해제 (GC가 회수하도록)
      imgs.forEach((img) => (img.src = ""));
    };
  }, [frames]);

  if (frames.length === 0) return null;

  return (
    <>
      <style>{keyframesCss}</style>
      <div
        aria-hidden
        className={cn("bg-transparent bg-center bg-no-repeat", className)}
        style={{
          width: size,
          height: size,
          backgroundImage: `url("${frames[0]}")`,
          backgroundSize: "contain",
          animation: `${animName} ${duration}s steps(${frames.length}) infinite`,
        }}
      />
    </>
  );
}
