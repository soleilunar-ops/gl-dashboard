import PageWrapper from "@/components/layout/PageWrapper";
import OrderDashboard from "@/components/orders/OrderDashboard";

export default function OrdersPage() {
  return (
    <PageWrapper title="주문 관리">
      <OrderDashboard />
    </PageWrapper>
  );
}
