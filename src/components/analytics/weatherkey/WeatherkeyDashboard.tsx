"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AIBriefStubCard from "./AIBriefStubCard";
import DashboardHeader from "./DashboardHeader";
import KeywordTrendsPanel from "./KeywordTrendsPanel";
import SeasonKpiStrip from "./SeasonKpiStrip";
import TriggerAlertPanel from "./TriggerAlertPanel";
import TriggerHistoryPanel from "./TriggerHistoryPanel";
import { useCurrentSeason } from "./_hooks/useCurrentSeason";
import { useSeasonQuery } from "./_hooks/useSeasonQuery";

const SeasonTimelineChart = dynamic(() => import("./SeasonTimelineChart"), {
  ssr: false,
  loading: () => (
    <Card className="h-[560px]">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="w-full flex-1" />
      </CardContent>
    </Card>
  ),
});

export default function WeatherkeyDashboard() {
  const { data: sr, loading: autoLoading, error: autoError } = useCurrentSeason();
  const { selected, setSeason } = useSeasonQuery();
  const effective = selected ?? sr.current?.season ?? null;

  const handleOpenTuning = () => {
    console.info("[weatherkey] open tuning drawer (stub — 별도 스프린트)");
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-6">
      <DashboardHeader
        displayInfo={sr.current}
        selectedSeason={effective}
        onSeasonChange={setSeason}
        onOpenTuning={handleOpenTuning}
      />

      {autoError && (
        <div className="text-destructive rounded-md border p-3 text-sm">
          시즌 확정 실패: {autoError}
        </div>
      )}

      <SeasonKpiStrip season={effective} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <SeasonTimelineChart season={effective} />
        </section>
        <aside className="flex flex-col gap-4 self-start">
          <TriggerAlertPanel seasonInfo={sr.current} nextSeason={sr.next} />
        </aside>
      </div>

      <TriggerHistoryPanel season={effective} />

      <AIBriefStubCard seasonName={effective} />

      <KeywordTrendsPanel season={effective} />

      {autoLoading && !effective && (
        <div className="text-muted-foreground text-xs" aria-live="polite">
          시즌 정보 로딩 중…
        </div>
      )}
    </div>
  );
}
