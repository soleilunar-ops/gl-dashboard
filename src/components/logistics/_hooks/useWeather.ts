// 변경 이유: 재작업일 날짜별 날씨 조회 상태를 캐싱해 카드 렌더링 성능과 사용자 경험을 개선했습니다.
"use client";

import { useCallback, useState } from "react";

function labelToEmoji(label: string, isRainy: boolean): string {
  if (label.includes("뇌우")) return "⛈️";
  if (label.includes("소나기")) return "🌦️";
  if (label.includes("비")) return "🌧️";
  if (label.includes("눈")) return "❄️";
  if (label.includes("흐림")) return "☁️";
  if (label.includes("구름많음")) return "⛅";
  if (label.includes("맑음")) return "☀️";
  return isRainy ? "🌧️" : "🌤️";
}

export interface WeatherState {
  status: "idle" | "loading" | "success" | "error";
  data?: {
    pop: number;
    isRainy: boolean;
    label: string;
    emoji: string;
  };
  message?: string;
}

interface WeatherApiPayload {
  pop: number;
  isRainy: boolean;
  label: string;
  emoji?: string;
}

export function useWeather() {
  const [cache, setCache] = useState<Record<string, WeatherState>>({});

  const fetchWeather = useCallback(
    async (date: string) => {
      if (!date) return;
      const current = cache[date];
      if (current?.status === "loading" || current?.status === "success") return;

      setCache((prev) => ({ ...prev, [date]: { status: "loading" } }));

      try {
        const response = await fetch(`/api/weather?date=${date}`);
        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(errorData.message ?? "API 오류");
        }

        const data = (await response.json()) as WeatherApiPayload;
        setCache((prev) => ({
          ...prev,
          [date]: {
            status: "success",
            data: {
              pop: Number.isFinite(data.pop) ? data.pop : 0,
              isRainy: Boolean(data.isRainy),
              label: data.label || "구름많음",
              emoji: data.emoji ?? labelToEmoji(data.label || "구름많음", Boolean(data.isRainy)),
            },
          },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "날씨 정보를 불러올 수 없습니다.";
        setCache((prev) => ({
          ...prev,
          [date]: { status: "error", message },
        }));
      }
    },
    [cache]
  );

  return { weatherCache: cache, fetchWeather };
}
