import PageWrapper from "@/components/layout/PageWrapper";
import CostAnalyticsDashboard from "@/components/analytics/cost/CostAnalyticsDashboard";

export default function CostPage() {
  return (
    <PageWrapper title="마진 산출">
      <CostAnalyticsDashboard />
    </PageWrapper>
  );
}
