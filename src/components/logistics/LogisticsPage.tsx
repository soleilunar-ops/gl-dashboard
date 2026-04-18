"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InventoryDashboard from "./InventoryDashboard";
import LogisticsSettings from "./LogisticsSettings";
import StockMovementsTab from "./StockMovementsTab";
import type { InventoryItem } from "./_hooks/useInventory";

export default function LogisticsPage() {
  const [activeTab, setActiveTab] = useState("inventory");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const handleItemClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setActiveTab("movements");
  };

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-medium">창고 재고</h1>
      <p className="text-muted-foreground mb-6 text-sm">Supabase 기준 실시간 재고·입출고</p>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inventory">총재고현황</TabsTrigger>
          <TabsTrigger value="movements">입출고내역</TabsTrigger>
          <TabsTrigger value="settings">설정</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-4">
          <InventoryDashboard onItemClick={handleItemClick} />
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <StockMovementsTab
            selectedItem={selectedItem}
            onSelectItem={setSelectedItem}
            onClearItem={() => setSelectedItem(null)}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <LogisticsSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
