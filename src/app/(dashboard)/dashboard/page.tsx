import { DashboardMain } from "@/components/dashboard/DashboardMain";

// 실시간 브리핑·주간 리포트 데이터 — 정적 프리렌더 비활성
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardMain />;
}
