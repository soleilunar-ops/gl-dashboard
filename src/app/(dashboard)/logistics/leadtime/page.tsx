import LeadTimeTracker from "@/components/logistics/LeadTimeTracker";

export default function LeadtimePage() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-xl font-medium">수입 리드타임</h1>
        <p className="text-muted-foreground text-sm">
          수기 등록 후 BL로 상하이 출항부터 파주 창고 입고까지 추적합니다. (유니패스·공공데이터포털
          외항반출입)
        </p>
      </header>
      <LeadTimeTracker variant="page" />
    </div>
  );
}
