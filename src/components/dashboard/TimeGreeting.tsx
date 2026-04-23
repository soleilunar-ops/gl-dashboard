"use client";

import { useEffect, useState } from "react";

type Slot = "morning" | "afternoon" | "evening" | "night";

const GREETINGS: Record<Slot, string[]> = {
  morning: [
    "좋은 아침이에요, 오늘도 활활 불태워봐요",
    "산뜻한 하루의 시작, 하루온과 함께해요",
    "오늘 하루도 잘 부탁드려요",
  ],
  afternoon: [
    "점심은 든든히 드셨나요? 오후도 힘내요",
    "햇살 좋은 오후, 집중해서 달려봐요",
    "하루의 절반, 이미 잘 해내고 있어요",
  ],
  evening: [
    "오늘 하루도 수고 많으셨어요",
    "저녁 노을처럼 따뜻한 마무리 되세요",
    "조금만 더 힘내요, 거의 다 왔어요",
  ],
  night: [
    "늦은 시간까지 고생 많으세요",
    "오늘 하루도 불태운 당신, 충분히 대단해요",
    "잠시 쉬어가도 괜찮아요",
  ],
};

function resolveSlot(hour: number): Slot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

/** 사용자 로컬 시간에 맞춰 아침/낮/저녁/밤 인사말을 랜덤으로 표시 */
export function TimeGreeting() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const pool = GREETINGS[resolveSlot(new Date().getHours())];
    setMessage(pool[Math.floor(Math.random() * pool.length)]);
  }, []);

  if (!message) {
    return <div aria-hidden className="h-12" />;
  }

  return (
    <p className="text-foreground/85 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
      {message}
    </p>
  );
}
