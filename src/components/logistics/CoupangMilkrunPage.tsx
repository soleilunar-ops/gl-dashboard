// 변경 이유: 재작업일 날씨 탭을 제외하고 비용 계산기·기간별 조회만 노출합니다.
"use client";

import MilkrunCalculatorTab from "@/components/logistics/milkrun/MilkrunCalculatorTab";
import MilkrunHistoryTab from "@/components/logistics/milkrun/MilkrunHistoryTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CoupangMilkrunPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-medium">쿠팡 밀크런 관리</h1>
        <p className="text-muted-foreground text-sm">
          센터별 비용 시뮬레이션과 저장된 배정 기간별 조회를 제공합니다.
        </p>
      </header>

      <Tabs defaultValue="calculator" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="calculator">비용 계산기</TabsTrigger>
          <TabsTrigger value="history">기간별 조회</TabsTrigger>
        </TabsList>
        <TabsContent value="calculator" className="mt-4">
          <MilkrunCalculatorTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <MilkrunHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
