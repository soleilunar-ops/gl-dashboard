"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThermometerSearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
}

/** 온도계 모양 검색창: 튜브와 전구를 하나의 SVG 패스로 그려 이음매 없이 연결 */
export function ThermometerSearchBar({
  placeholder = "무엇이든 물어보세요, 하루루!",
  onSearch,
}: ThermometerSearchBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  // 눈금 21개 (20°C ~ 40°C, 5단위 강조)
  const ticks = Array.from({ length: 21 });

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch?.(value.trim());
        }}
      >
        <div
          className={cn(
            "relative aspect-[8/1] w-full transition-all",
            focused
              ? "drop-shadow-[0_12px_26px_rgba(242,190,92,0.35)]"
              : "drop-shadow-[0_6px_18px_rgba(242,190,92,0.22)]"
          )}
        >
          {/* 온도계 외곽 — 튜브+전구가 하나의 path
              ※ overflow-visible 필수: 전구 arc가 viewBox 우측 경계에 맞닿아서 stroke가 잘림 */}
          <svg
            viewBox="0 0 640 80"
            className="absolute inset-0 h-full w-full overflow-visible"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            <defs>
              <linearGradient id="thermo-tube" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#FEFAEA" />
                <stop offset="0.55" stopColor="#FDF3D0" />
                <stop offset="0.88" stopColor="#FAE8B8" />
                <stop offset="1" stopColor="#F5D88A" />
              </linearGradient>
              <radialGradient id="bulb-mercury" cx="0.5" cy="0.55" r="0.55">
                <stop offset="0" stopColor="#F2BE5C" stopOpacity="0.55" />
                <stop offset="0.65" stopColor="#F2BE5C" stopOpacity="0.25" />
                <stop offset="1" stopColor="#F2BE5C" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* 온도계 몸체: 왼쪽 캡(28r 반원) → 위 직선 → 전구(40r 큰 원) → 아래 직선 */}
            <path
              d="M 28 12 L 571.43 12 A 40 40 0 1 1 571.43 68 L 28 68 A 28 28 0 1 1 28 12 Z"
              fill="url(#thermo-tube)"
              stroke="#E8C987"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            {/* 전구 내부 수은(따뜻한 온기) */}
            <circle cx="600" cy="40" r="30" fill="url(#bulb-mercury)" />

            {/* 유리 반사 하이라이트 */}
            <ellipse cx="588" cy="28" rx="6" ry="4" fill="rgba(255,255,255,0.75)" />
          </svg>

          {/* 입력 영역 (튜브 위에 오버레이) */}
          <div
            className="absolute flex items-center"
            style={{ left: "5%", right: "15%", top: 0, bottom: 0 }}
          >
            <Search className="h-5 w-5 shrink-0 text-[#C89B4A]/80" aria-hidden />
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              className="ml-3 flex-1 bg-transparent text-[15px] text-gray-800 placeholder:text-[#BA8A30]/70 focus:outline-none"
              aria-label="검색어 입력"
            />
          </div>

          {/* 검색 버튼 (전구 위에 투명 오버레이) */}
          <button
            type="submit"
            aria-label="검색"
            className="absolute rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A83E]"
            style={{ left: "87.5%", top: 0, width: "12.5%", height: "100%" }}
          />
        </div>

        {/* 눈금 (20°C ~ 40°C, 전체 너비) */}
        <div className="mt-2.5 flex items-center gap-3 px-4 text-[11px] font-medium">
          <span className="shrink-0 text-[#C89B4A]">20°C</span>
          <div className="relative flex h-3.5 flex-1 items-end" aria-hidden>
            {ticks.map((_, i) => {
              const t = i / (ticks.length - 1);
              const isMajor = i % 5 === 0;
              return (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    height: isMajor ? "100%" : "55%",
                    borderLeft: `1px solid rgba(217, 157, 62, ${0.22 + t * 0.55})`,
                  }}
                />
              );
            })}
          </div>
          <span className="shrink-0 text-[#A67720]">40°C</span>
        </div>
      </form>
    </div>
  );
}
