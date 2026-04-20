import PageWrapper from "@/components/layout/PageWrapper";
import OrderDashboard from "@/components/orders/OrderDashboard";

export default function OrdersPage() {
  return (
    <PageWrapper title="주문 관리(구매·판매·반품)">
      <OrderDashboard />
    </PageWrapper>
  );
}
