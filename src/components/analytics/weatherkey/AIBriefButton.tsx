"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onOpen: () => void;
}

/**
 * 상단바 🤖 CTA. 클릭 시 시즌 브리프 슬라이드오버 open.
 * M2: 핸들러만 전달 — 실제 드로어는 M4+에서 구현.
 */
export default function AIBriefButton({ onOpen }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={onOpen}
      aria-label="AI 시즌 브리프 열기"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      AI 브리프
    </Button>
  );
}
