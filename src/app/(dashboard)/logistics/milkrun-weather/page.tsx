// 변경 이유: 재작업일 날씨·파주 일별 예보·중국 연휴(내장·수동)를 한 페이지에 둡니다.
import PajuWeatherDashboard from "@/components/logistics/milkrun/PajuWeatherDashboard";

export default function MilkrunWeatherPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-medium">파주·재작업·중국 연휴</h1>
      </header>
      <PajuWeatherDashboard />
    </div>
  );
}
