"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "../components/FilterBar";
import { InventoryTable, type InventoryViewRow } from "../components/InventoryTable";
import { ItemDetailPanel } from "../components/ItemDetailPanel";
import { SummaryCards } from "../components/SummaryCards";
import { useInventoryStore } from "../store/inventory";

interface TransactionSummaryRow {
  tx_date: string;
  tx_type: string;
  qty: number;
}

export default function LogisticsDashboardPage() {
  const { filters } = useInventoryStore();
  const [rows, setRows] = useState<InventoryViewRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState("-");
  const [todayIncoming, setTodayIncoming] = useState(0);
  const [todayOutgoing, setTodayOutgoing] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const [itemsResponse, txResponse, syncResponse] = await Promise.all([
        fetch("/api/items"),
        fetch("/api/transactions"),
        fetch("/api/erp/sync"),
      ]);

      if (itemsResponse.ok) {
        const payload = (await itemsResponse.json()) as InventoryViewRow[];
        setRows(payload);
      }

      if (txResponse.ok) {
        const txPayload = (await txResponse.json()) as TransactionSummaryRow[];
        const today = new Date().toISOString().slice(0, 10);
        const todayRows = txPayload.filter((row) => row.tx_date === today);
        const incoming = todayRows
          .filter((row) => row.tx_type.startsWith("IN_"))
          .reduce((acc, row) => acc + row.qty, 0);
        const outgoing = todayRows
          .filter((row) => row.tx_type.startsWith("OUT_"))
          .reduce((acc, row) => acc + row.qty, 0);
        setTodayIncoming(incoming);
        setTodayOutgoing(outgoing);
      }

      if (syncResponse.ok) {
        setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      }
    };

    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesKeyword =
        filters.keyword.length === 0 ||
        row.item_name.toLowerCase().includes(filters.keyword.toLowerCase()) ||
        (row.erp_code ?? "").toLowerCase().includes(filters.keyword.toLowerCase());
      const matchesType =
        filters.productionType === "all" || row.production_type === filters.productionType;
      return matchesKeyword && matchesType;
    });
  }, [rows, filters]);

  const totalStockAmount = useMemo(
    () => filteredRows.reduce((acc, row) => acc + row.stock_amount, 0),
    [filteredRows]
  );

  const selectedItem = filteredRows.find((row) => row.id === selectedItemId) ?? null;

  const handleExport = () => {
    const params = new URLSearchParams({
      keyword: filters.keyword,
      productionType: filters.productionType,
    });
    window.location.href = `/api/export/excel?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">GL 재고관리</h1>
          <nav className="flex gap-3 text-sm">
            <a href="#inventory" className="hover:underline">
              총재고 현황
            </a>
            <a href="#scheduled" className="hover:underline">
              입출고 예정
            </a>
            <a href="/settings" className="hover:underline">
              설정
            </a>
          </nav>
        </div>
        <p className="text-xs text-gray-500">마지막 ERP 동기화: {lastSyncedAt}</p>
      </header>

      <SummaryCards
        totalSku={144}
        totalStockAmount={totalStockAmount}
        todayIncoming={todayIncoming}
        todayOutgoing={todayOutgoing}
      />
      <FilterBar onExport={handleExport} />
      <section id="inventory">
        <InventoryTable rows={filteredRows} onSelectItem={setSelectedItemId} />
      </section>

      {selectedItem ? (
        <ItemDetailPanel
          itemId={selectedItem.id}
          itemName={selectedItem.item_name}
          manufactureYear={selectedItem.manufacture_year ?? null}
          erpCode={selectedItem.erp_code ?? ""}
          coupangSkuId={selectedItem.coupang_sku_id ?? null}
          productionType={selectedItem.production_type}
          currentQty={selectedItem.current_qty}
          erpQty={selectedItem.erp_qty}
          diff={selectedItem.diff}
          stockAmount={selectedItem.stock_amount}
          costPrice={selectedItem.cost_price}
          incoming7d={selectedItem.in_7days}
          outgoing7d={selectedItem.out_7days}
          onClose={() => setSelectedItemId(null)}
        />
      ) : null}
    </div>
  );
}
