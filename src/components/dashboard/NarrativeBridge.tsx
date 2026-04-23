"use client";

import { useDemoData } from "@/lib/demo";

export function NarrativeBridge() {
  const { profile } = useDemoData();
  const text =
    profile.id === "peak"
      ? "오늘의 브리핑은 여기까지입니다. 이번 주 전체 흐름도 정리해 드릴까요?"
      : profile.id === "first_freeze"
        ? "첫 영하 돌파 주간입니다. 지난 주 흐름을 정리해 드릴까요?"
        : "이번 주 주간 리포트를 생성하시거나 지난 리포트를 확인하실 수 있습니다.";

  return (
    <div className="narrative-bridge" role="presentation">
      <div className="narrative-bridge-inner">{text}</div>
    </div>
  );
}
