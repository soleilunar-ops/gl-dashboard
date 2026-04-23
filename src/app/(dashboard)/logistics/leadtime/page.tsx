import LeadTimeTracker from "@/components/logistics/LeadTimeTracker";

export default function LeadtimePage() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">수입 리드타임</h1>
      </header>
      <LeadTimeTracker variant="page" />
    </div>
  );
}
