import PromotionTabs from "@/components/analytics/promotion/PromotionTabs";

export default function PromotionPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl">프로모션 분석</h1>
      <PromotionTabs />
    </div>
  );
}
