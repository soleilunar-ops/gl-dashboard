"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Package, ShoppingCart, TrendingUp } from "lucide-react";

/** lucide 아이콘은 클라이언트 경계에서만 사용해 RSC/Turbopack 매니페스트 오류를 방지 */
export function DashboardSummaryCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">총 품목 수</CardTitle>
          <Package className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">—</p>
          <p className="text-muted-foreground text-xs">item_master 연동 예정</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">금일 출고</CardTitle>
          <ShoppingCart className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">—</p>
          <p className="text-muted-foreground text-xs">stock_movement 연동 예정</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">쿠팡 매출</CardTitle>
          <TrendingUp className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">—</p>
          <p className="text-muted-foreground text-xs">daily_performance 연동 예정</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">품절 경고</CardTitle>
          <AlertTriangle className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">—</p>
          <p className="text-muted-foreground text-xs">inventory 연동 예정</p>
        </CardContent>
      </Card>
    </div>
  );
}
