import LeadTimeTracker from "@/components/logistics/LeadTimeTracker";

export default function LeadtimePage() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-xl font-medium">수입 리드타임</h1>
        <p className="text-muted-foreground text-sm">
          발주부터 파주 입고까지 단계별 일정을 추적합니다.
        </p>
      </header>
      <LeadTimeTracker variant="page" />
    </div>
  );
}
