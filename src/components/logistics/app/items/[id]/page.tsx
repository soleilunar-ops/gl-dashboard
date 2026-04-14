import { ItemDetailPanel } from "../../../components/ItemDetailPanel";
import { TransactionForm } from "../../../components/TransactionForm";

interface ItemDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { id } = await params;
  const itemId = Number(id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">품목 상세 #{itemId}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <ItemDetailPanel
          itemId={itemId}
          itemName={`품목 ${itemId}`}
          erpCode={`GL${itemId}`}
          productionType={null}
          currentQty={0}
          erpQty={0}
          diff={0}
          stockAmount={0}
          incoming7d={0}
          outgoing7d={0}
          onClose={() => undefined}
        />
        <TransactionForm itemId={itemId} />
      </div>
    </div>
  );
}
