"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIBriefStubCard from "./AIBriefStubCard";
import DashboardHeader from "./DashboardHeader";
import ForecastTriggerScan from "./ForecastTriggerScan";
import SeasonKpiStrip from "./SeasonKpiStrip";
import StaticStateLiftPanel from "./StaticStateLiftPanel";
import TriggerGuidePanel from "./TriggerGuidePanel";
import TriggerHistoryPanel from "./TriggerHistoryPanel";
import { useCurrentSeason } from "./_hooks/useCurrentSeason";
import { HighlightProvider } from "./_hooks/useHighlightQuery";
import { MockDateProvider } from "./_hooks/useMockDate";
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
    <MockDateProvider>
      <HighlightProvider>
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

          <Tabs defaultValue="season" className="gap-4">
            <TabsList>
              <TabsTrigger value="season">시즌별</TabsTrigger>
              <TabsTrigger value="weather">날씨별 판매</TabsTrigger>
              <TabsTrigger value="ai">AI 리포트</TabsTrigger>
            </TabsList>

            <TabsContent value="season" className="space-y-4">
              <SeasonKpiStrip season={effective} />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <section className="xl:col-span-2">
                  <SeasonTimelineChart season={effective} />
                </section>
                <aside className="flex flex-col gap-4 self-start">
                  <ForecastTriggerScan seasonInfo={sr.current} nextSeason={sr.next} />
                </aside>
              </div>

              <TriggerGuidePanel season={effective} />
            </TabsContent>

            <TabsContent value="weather" className="space-y-4">
              <TriggerHistoryPanel season={effective} />
              <StaticStateLiftPanel season={effective} />
            </TabsContent>

            <TabsContent value="ai">
              <AIBriefStubCard seasonName={effective} />
            </TabsContent>
          </Tabs>

          {autoLoading && !effective && (
            <div className="text-muted-foreground text-xs" aria-live="polite">
              시즌 정보 로딩 중…
            </div>
          )}
        </div>
      </HighlightProvider>
    </MockDateProvider>
  );
}
