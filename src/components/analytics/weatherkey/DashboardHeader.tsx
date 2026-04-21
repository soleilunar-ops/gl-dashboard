"use client";

import { Triangle } from "lucide-react";
import AdminPopover from "./AdminPopover";
import DataHealthBadge from "./DataHealthBadge";
import SeasonSelect from "./SeasonSelect";
import TuningProposalsBadge from "./TuningProposalsBadge";
import type { CurrentSeasonInfo } from "./_types";

interface Props {
  displayInfo: CurrentSeasonInfo | null;
  selectedSeason: string | null;
  onSeasonChange: (season: string) => void;
  onOpenTuning: () => void;
}

const STATUS_LABEL: Record<CurrentSeasonInfo["status"], string> = {
  active: "진행 중",
  upcoming: "예정",
  closed: "종료",
};

/**
 * 페이지 상단바 (48px). docs/HOTPACK_DASHBOARD_LAYOUT.md §2 [A] 구현.
 *
 * TuningProposalsBadge.pendingCount는 `trigger_tuning_proposals` 테이블이 아직 DB에 없어
 * M2 단계에서는 0으로 하드코딩 → 뱃지 숨김. HOTPACK_SEASON.md P1 구현 시점에 훅 연결.
 */
export default function DashboardHeader({
  displayInfo,
  selectedSeason,
  onSeasonChange,
  onOpenTuning,
}: Props) {
  const tuningPending = 0;

  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Triangle className="text-muted-foreground h-5 w-5" aria-hidden />
        <h1 className="text-lg font-medium">핫팩 시즌 대시보드</h1>
        {displayInfo && (
          <span className="text-muted-foreground text-xs">
            · {STATUS_LABEL[displayInfo.status]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SeasonSelect value={selectedSeason} onChange={onSeasonChange} />
        <DataHealthBadge />
        <TuningProposalsBadge pendingCount={tuningPending} onOpen={onOpenTuning} />
        <AdminPopover />
      </div>
    </header>
  );
}
