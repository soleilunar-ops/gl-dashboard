// 변경 이유: 재작업일 날씨 탭을 제외하고 비용 계산기·기간별 조회만 노출합니다.
"use client";

import MilkrunCalculatorTab from "@/components/logistics/milkrun/MilkrunCalculatorTab";
import MilkrunHistoryTab from "@/components/logistics/milkrun/MilkrunHistoryTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CoupangMilkrunPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">쿠팡 밀크런 관리</h1>
      </header>

      <Tabs defaultValue="calculator" className="w-full">
        <TabsList>
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
