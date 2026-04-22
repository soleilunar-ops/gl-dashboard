"use client";

import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BudgetPlannerTab from "@/components/analytics/promotion/BudgetPlannerTab";
import PromotionEffectTab from "@/components/analytics/promotion/PromotionEffectTab";
import RoiAnalysisTab from "@/components/analytics/promotion/RoiAnalysisTab";
import SeasonAlertTab from "@/components/analytics/promotion/SeasonAlertTab";
import { usePromotion } from "@/components/analytics/promotion/_hooks/usePromotion";

/** 프로모션 분석 4탭: usePromotion 1회 호출 후 data·로딩·에러를 각 탭에 전달 */
export default function PromotionTabs() {
  const { data, loading, error } = usePromotion();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <p className="text-red-500">에러: {error}</p>;
  }

  if (!data) {
    return <p className="text-muted-foreground text-sm">표시할 데이터가 없습니다.</p>;
  }

  return (
    <div className="w-full space-y-4">
      {data.currentSeason === null && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/25 dark:text-amber-100"
        >
          현재 진행 중인 시즌이 없습니다. 26시즌은 2026년 9월 시작 예정입니다.
        </div>
      )}

      <Tabs defaultValue="effect" className="w-full">
        {/* 탭 바를 상단 중앙에 배치해 항상 동일한 위치에서 보이게 유지 */}
        <TabsList className="mx-auto mb-4 flex w-fit flex-wrap justify-center gap-1">
          <TabsTrigger value="effect">프로모션 효과</TabsTrigger>
          <TabsTrigger value="roi">ROI 분석</TabsTrigger>
          <TabsTrigger value="budget">예산 플래너</TabsTrigger>
          <TabsTrigger value="alert">시즌 알림</TabsTrigger>
        </TabsList>
        <TabsContent value="effect" className="mt-0 overflow-x-hidden">
          <PromotionEffectTab data={data} />
        </TabsContent>
        <TabsContent value="roi" className="mt-0 overflow-x-hidden">
          <RoiAnalysisTab data={data} />
        </TabsContent>
        <TabsContent value="budget" className="mt-0 overflow-x-hidden">
          <BudgetPlannerTab data={data} />
        </TabsContent>
        <TabsContent value="alert" className="mt-0 overflow-x-hidden">
          <SeasonAlertTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
