"use client";

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

export default function DashboardHeader({ selectedSeason, onSeasonChange, onOpenTuning }: Props) {
  const tuningPending = 0;

  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">날씨별 핫팩 판매</h1>

      <div className="flex items-center gap-2">
        <SeasonSelect value={selectedSeason} onChange={onSeasonChange} />
        <DataHealthBadge />
        <TuningProposalsBadge pendingCount={tuningPending} onOpen={onOpenTuning} />
        <AdminPopover />
      </div>
    </header>
  );
}
