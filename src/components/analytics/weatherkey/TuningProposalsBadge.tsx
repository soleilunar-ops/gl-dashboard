"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  pendingCount: number;
  onOpen: () => void;
}

/**
 * 상단바 🔔 뱃지. `pendingCount > 0`일 때만 표시.
 * M2: 인터페이스만 — 실제 카운트는 `trigger_tuning_proposals` 테이블·뷰 생성 이후 (HOTPACK_SEASON.md P1) 연결.
 */
export default function TuningProposalsBadge({ pendingCount, onOpen }: Props) {
  if (pendingCount <= 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-hotpack-trigger-high h-8 gap-1.5 text-xs"
      onClick={onOpen}
      aria-label={`튜닝 제안 ${pendingCount}건`}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
      튜닝 제안
      <span className="rounded-full bg-current px-1.5 text-[10px] text-white tabular-nums">
        {pendingCount}
      </span>
    </Button>
  );
}
