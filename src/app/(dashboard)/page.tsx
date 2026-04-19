import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards";
import { Card, CardContent } from "@/components/ui/card";

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

      {/* 요약 카드: lucide는 클라이언트 컴포넌트에서만 사용 */}
      <DashboardSummaryCards />
    </div>
  );
}
