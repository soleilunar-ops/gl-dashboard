import { HomeHero } from "@/components/dashboard/HomeHero";

// 실시간 데이터(Supabase 쿼리·시간 기준 계산) 사용 — 빌드 시 정적 프리렌더 비활성
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <HomeHero />;
}
