"use client";

import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card>
        <CardContent className="px-4 py-3 text-center">
          <p className="text-foreground text-base font-bold tracking-tight">총 SKU</p>
          {loading ? (
            <Skeleton className="mx-auto mt-1.5 h-8 w-28" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {totalSku.toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="px-4 py-3 text-center">
          <p className="text-foreground text-base font-bold tracking-tight">총 재고금액</p>
          {loading ? (
            <Skeleton className="mx-auto mt-1.5 h-8 w-32" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {wonFormatter.format(totalStockAmount)}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="px-4 py-3 text-center">
          <p className="text-foreground text-base font-bold tracking-tight">오늘 입고</p>
          {loading ? (
            <Skeleton className="mx-auto mt-1.5 h-8 w-20" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold text-emerald-600 tabular-nums">
              +{todayIncoming.toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="px-4 py-3 text-center">
          <p className="text-foreground text-base font-bold tracking-tight">오늘 출고</p>
          {loading ? (
            <Skeleton className="mx-auto mt-1.5 h-8 w-20" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold text-rose-600 tabular-nums">
              −{todayOutgoing.toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
