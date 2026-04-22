"use client";

import { useState } from "react";
import { Search, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThermometerSearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
}

/** 온도계가 누워있는 모양의 검색창 (하루온 톤: 오렌지 그라데이션) */
export function ThermometerSearchBar({
  placeholder = "무엇이든 물어보세요, 하루루!",
  onSearch,
}: ThermometerSearchBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  // 눈금 21개 (20°C ~ 40°C, 1°C 간격), 5단위는 강조
  const ticks = Array.from({ length: 21 });

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch?.(value.trim());
        }}
        className={cn(
          "relative rounded-full bg-gradient-to-r from-orange-100 via-orange-200 to-orange-400 p-[2px] transition-all",
          focused
            ? "shadow-[0_12px_30px_-10px_rgba(234,88,12,0.55)]"
            : "shadow-[0_8px_22px_-12px_rgba(251,146,60,0.5)]"
        )}
      >
        <div className="flex w-full items-center rounded-full bg-white/95 px-5 py-3.5 backdrop-blur">
          <Search className="h-5 w-5 shrink-0 text-orange-400" aria-hidden />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            className="ml-3 flex-1 bg-transparent text-[15px] text-gray-700 placeholder:text-orange-300/90 focus:outline-none"
            aria-label="검색어 입력"
          />
          <div className="mx-3 h-6 w-px bg-orange-200" aria-hidden />
          <button
            type="submit"
            aria-label="검색"
            className="shrink-0 rounded-full p-1 text-orange-400 transition-colors hover:text-orange-600"
          >
            <Sun className="h-5 w-5" />
          </button>
        </div>
      </form>

      {/* 온도 눈금 */}
      <div className="mt-2.5 flex items-center gap-3 px-4 text-[11px] font-medium">
        <span className="shrink-0 text-orange-300">20°C</span>
        <div className="relative flex h-3.5 flex-1 items-end" aria-hidden>
          {ticks.map((_, i) => {
            const t = i / (ticks.length - 1); // 0 ~ 1
            const isMajor = i % 5 === 0;
            return (
              <div
                key={i}
                className="flex-1"
                style={{
                  height: isMajor ? "100%" : "55%",
                  borderLeft: `1px solid rgba(234, 88, 12, ${0.2 + t * 0.6})`,
                }}
              />
            );
          })}
        </div>
        <span className="shrink-0 text-orange-600">40°C</span>
      </div>
    </div>
  );
}
