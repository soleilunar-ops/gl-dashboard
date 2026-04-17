"use client";

import BudgetPlanner from "@/components/analytics/promotion/BudgetPlanner";
import PromotionSalesOverlay from "@/components/analytics/promotion/PromotionSalesOverlay";
import ROICalculator from "@/components/analytics/promotion/ROICalculator";
import SeasonAlertMonitor from "@/components/analytics/promotion/SeasonAlertMonitor";
import SeasonCompare from "@/components/analytics/promotion/SeasonCompare";
import TimingOptimizer from "@/components/analytics/promotion/TimingOptimizer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PromotionDashboard() {
  return (
    <Tabs defaultValue="effect" className="space-y-3">
      <TabsList variant="line" className="w-full justify-start border-b pb-1">
        <TabsTrigger value="effect">프로모션 효과</TabsTrigger>
        <TabsTrigger value="season">시즌 비교</TabsTrigger>
        <TabsTrigger value="roi">ROI 분석</TabsTrigger>
        <TabsTrigger value="forecast">예측</TabsTrigger>
      </TabsList>

      <TabsContent value="effect">
        <PromotionSalesOverlay />
      </TabsContent>

      <TabsContent value="season">
        <SeasonCompare />
      </TabsContent>

      <TabsContent value="roi">
        <ROICalculator />
      </TabsContent>

      <TabsContent value="forecast">
        <Tabs defaultValue="budget" className="space-y-3">
          <TabsList variant="line" className="w-full justify-start border-b pb-1">
            <TabsTrigger value="budget">예산 플래너</TabsTrigger>
            <TabsTrigger value="timing">타이밍 전략</TabsTrigger>
            <TabsTrigger value="alert">시즌 알림</TabsTrigger>
          </TabsList>

          <TabsContent value="budget">
            <BudgetPlanner />
          </TabsContent>
          <TabsContent value="timing">
            <TimingOptimizer />
          </TabsContent>
          <TabsContent value="alert">
            <SeasonAlertMonitor />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
