"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CoupangFcInventoryTab from "./CoupangFcInventoryTab";
import LogisticsGlTab from "./LogisticsGlTab";
import LogisticsUnifiedTab from "./LogisticsUnifiedTab";

export default function LogisticsPage() {
  const [activeTab, setActiveTab] = useState("unified");

  return (
    <div className="p-6">
      <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">물류 현황</h1>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="unified">통합 현황</TabsTrigger>
          <TabsTrigger value="gl">GL창고</TabsTrigger>
          <TabsTrigger value="coupang">쿠팡센터</TabsTrigger>
        </TabsList>

        <TabsContent value="unified" className="mt-4">
          <LogisticsUnifiedTab />
        </TabsContent>

        <TabsContent value="gl" className="mt-4">
          <LogisticsGlTab />
        </TabsContent>

        <TabsContent value="coupang" className="mt-4">
          <CoupangFcInventoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
