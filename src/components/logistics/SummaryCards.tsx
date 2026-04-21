"use client";

import StatCard from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { InventoryItem } from "./_hooks/useInventory";

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

interface SummaryCardsProps {
  loading: boolean;
  items: InventoryItem[];
  todayIncoming: number;
  todayOutgoing: number;
}

export function SummaryCards({ loading, items, todayIncoming, todayOutgoing }: SummaryCardsProps) {
  const totalSku = items.length;
  const totalStockAmount = items.reduce((sum, row) => sum + row.stock_amount, 0);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-full max-w-[120px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard title="총 SKU" value={totalSku.toLocaleString()} />
      <StatCard title="총 재고금액" value={wonFormatter.format(totalStockAmount)} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">오늘 입고</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600">{todayIncoming.toLocaleString()}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">오늘 출고</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-red-600">{todayOutgoing.toLocaleString()}</p>
        </CardContent>
      </Card>
    </div>
  );
}
