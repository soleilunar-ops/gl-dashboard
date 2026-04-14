"use client";

import { Badge } from "@/components/ui/badge";
import { roundCurrency } from "@/lib/margin/useMarginCalc";

interface BatchRow {
  id: string;
  marginRate: number;
  expectedRevenue: number;
}

interface BatchProfitSidebarProps {
  rows: BatchRow[];
  totalExpectedRevenue: number;
  exCurrent: number;
}

export default function BatchProfitSidebar({
  rows,
  totalExpectedRevenue,
  exCurrent,
}: BatchProfitSidebarProps) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        출고 예정 수량 변경 시 즉시 업데이트 (현재 환율 {exCurrent.toFixed(1)})
      </p>
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">{row.id}</p>
            <Badge variant={row.marginRate < 0.02 ? "destructive" : "default"}>
              {(row.marginRate * 100).toFixed(2)}%
            </Badge>
          </div>
          <p className="mt-1 text-sm font-semibold">
            {roundCurrency(row.expectedRevenue).toLocaleString()}원
          </p>
        </div>
      ))}
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-muted-foreground text-xs">전체 총 기대 수익</p>
        <p className="text-lg font-semibold">
          {roundCurrency(totalExpectedRevenue).toLocaleString()}원
        </p>
      </div>
    </div>
  );
}
