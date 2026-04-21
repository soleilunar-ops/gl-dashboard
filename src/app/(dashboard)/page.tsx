import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, ShoppingCart, AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">대시보드</h1>

      {/* 환영 카드 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="text-lg font-medium">하루온 스마트 재고시스템에 오신 것을 환영합니다</p>
          <p className="text-muted-foreground mt-1 text-sm">
            팀원 컴포넌트 완성 후 실시간 현황이 이 페이지에 배치됩니다.
          </p>
        </CardContent>
      </Card>

      {/* 요약 카드 (스켈레톤) */}
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
    </div>
  );
}
