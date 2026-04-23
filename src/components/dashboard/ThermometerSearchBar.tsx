"use client";

import { useState, type ReactNode } from "react";
import { Search, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HARURU_MODELS } from "@/components/haruru/ModelPicker";
import { cn } from "@/lib/utils";

interface ThermometerSearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  /** 선택된 모델 ID */
  model: string;
  /** 모델 변경 콜백 */
  onModelChange: (next: string) => void;
  /** 모델 선택 비활성화 */
  modelDisabled?: boolean;
  /** 20°C 라벨 오른쪽에 붙일 노드 (예: 최근 대화 토글 버튼) */
  toolbarSlot?: ReactNode;
}

/**
 * 온도계 모양 검색창:
 *  - 왼쪽 돋보기: 클릭 시 Claude API 모델 선택 Popover
 *  - 오른쪽 전구(동그라미): 검색 제출 버튼
 *  - 하단 눈금: 20°C 옆에 toolbarSlot (최근 대화 버튼 등)
 */
export function ThermometerSearchBar({
  placeholder = "무엇이든 물어보세요, 하루루!",
  onSearch,
  model,
  onModelChange,
  modelDisabled,
  toolbarSlot,
}: ThermometerSearchBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

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

            <path
              d="M 28 12 L 571.43 12 A 40 40 0 1 1 571.43 68 L 28 68 A 28 28 0 1 1 28 12 Z"
              fill="url(#thermo-tube)"
              stroke="#E8C987"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            <circle cx="600" cy="40" r="30" fill="url(#bulb-mercury)" />
            <ellipse cx="588" cy="28" rx="6" ry="4" fill="rgba(255,255,255,0.75)" />
          </svg>

          {/* 입력 영역 */}
          <div
            className="absolute flex items-center"
            style={{ left: "5%", right: "15%", top: 0, bottom: 0 }}
          >
            {/* 돋보기 버튼 → 모델 선택 Popover */}
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="답변 모델 선택"
                  disabled={modelDisabled}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#C89B4A]/80 transition-all hover:bg-white/40 hover:text-[#A67720] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A83E] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Search className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={10}
                className="w-56 gap-0 border-[#F9DB94] bg-[#FDF3D0] p-1 ring-[#F9DB94]/40"
              >
                <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-[#8A6A1F]/70 uppercase">
                  답변 모델
                </div>
                {HARURU_MODELS.map((m) => {
                  const active = m.id === model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onModelChange(m.id);
                        setModelOpen(false);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-[#8A6A1F] hover:bg-[#FAE8B8]",
                        active && "bg-[#FAE8B8] font-medium"
                      )}
                    >
                      <span>{m.label}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>

            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              className="ml-2 flex-1 bg-transparent text-[15px] text-gray-800 placeholder:text-[#BA8A30]/70 focus:outline-none"
              aria-label="검색어 입력"
            />
          </div>

          {/* 전구(제출 버튼) — cursor-pointer + 호버 시 수은 약간 밝게 */}
          <button
            type="submit"
            aria-label="검색"
            className="group/bulb absolute cursor-pointer rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A83E]"
            style={{ left: "87.5%", top: 0, width: "12.5%", height: "100%" }}
          >
            <span className="absolute inset-2 rounded-full bg-[#F2BE5C]/0 transition-colors group-hover/bulb:bg-[#F2BE5C]/15" />
          </button>
        </div>

        {/* 눈금 + 20°C 옆 슬롯(최근 대화 버튼) */}
        <div className="mt-2.5 flex items-center gap-3 px-4 text-[11px] font-medium">
          <span className="shrink-0 text-[#C89B4A]">20°C</span>
          {toolbarSlot}
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
