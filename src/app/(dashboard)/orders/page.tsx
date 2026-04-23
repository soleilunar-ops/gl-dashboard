import PageWrapper from "@/components/layout/PageWrapper";
import OrderDashboard from "@/components/orders/OrderDashboard";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return (
    <PageWrapper title="주문관리">
      <OrderDashboard />
    </PageWrapper>
  );
}
