// 변경 이유: 재작업일 날씨·파주 일별 예보·중국 연휴(내장·수동)를 한 페이지에 둡니다.
import PajuWeatherDashboard from "@/components/logistics/milkrun/PajuWeatherDashboard";

export const dynamic = "force-dynamic";

export default function MilkrunWeatherPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">재작업 요소</h1>
      </header>
      <PajuWeatherDashboard />
    </div>
  );
}
