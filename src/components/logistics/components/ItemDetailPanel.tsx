"use client";

import { useState } from "react";
import { ErpComparison } from "./ErpComparison";
import { ScheduledPanel } from "./ScheduledPanel";
import { TransactionForm } from "./TransactionForm";
import { TransactionLedger } from "./TransactionLedger";

interface ItemDetailPanelProps {
  itemId: number;
  itemName: string;
  manufactureYear?: string | null;
  erpCode: string;
  coupangSkuId?: string | null;
  productionType: string | null;
  currentQty: number;
  erpQty: number;
  diff: number;
  stockAmount: number;
  costPrice?: number;
  incoming7d: number;
  outgoing7d: number;
  onClose: () => void;
}

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

export function ItemDetailPanel({
  itemId,
  itemName,
  manufactureYear,
  erpCode,
  coupangSkuId,
  productionType,
  currentQty,
  erpQty,
  diff,
  stockAmount,
  costPrice = 0,
  incoming7d,
  outgoing7d,
  onClose,
}: ItemDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<"ledger" | "manual" | "scheduled" | "erp">("ledger");
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);

  const tabs = [
    { key: "ledger", label: "입출고 내역" },
    { key: "manual", label: "직접 입력" },
    { key: "scheduled", label: "입출고 예정" },
    { key: "erp", label: "ERP 비교" },
  ] as const;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l bg-white p-5 shadow-2xl"
      style={{ width: "420px" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {itemName} {manufactureYear ? `(${manufactureYear})` : ""}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            ERP코드 {erpCode || "-"} · 쿠팡SKU {coupangSkuId ?? "-"} · 원가{" "}
            {wonFormatter.format(costPrice)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-2 py-1 text-sm hover:bg-slate-50"
        >
          X
        </button>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        유형: {productionType ?? "-"} / ERP 재고: {erpQty.toLocaleString()} / 차이:{" "}
        {diff.toLocaleString()}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border p-3">
          <p className="text-xs text-gray-500">실물재고</p>
          <p className="mt-1 font-semibold">{currentQty.toLocaleString()}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-500">재고금액</p>
          <p className="mt-1 font-semibold">{wonFormatter.format(stockAmount)}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-500">입고예정(7일)</p>
          <p className="mt-1 font-semibold text-emerald-700">{incoming7d.toLocaleString()}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-500">출고예정(7일)</p>
          <p className="mt-1 font-semibold text-rose-700">{outgoing7d.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 rounded-lg border p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded px-3 py-1.5 text-sm ${
              activeTab === tab.key
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {activeTab === "ledger" ? (
          <TransactionLedger itemId={itemId} refreshKey={ledgerRefreshKey} />
        ) : null}
        {activeTab === "manual" ? (
          <TransactionForm
            itemId={itemId}
            defaultUnitPrice={costPrice}
            onSubmitted={() => {
              setLedgerRefreshKey((prev) => prev + 1);
              setActiveTab("ledger");
            }}
          />
        ) : null}
        {activeTab === "scheduled" ? <ScheduledPanel itemId={itemId} /> : null}
        {activeTab === "erp" ? (
          <ErpComparison itemId={itemId} physicalQty={currentQty} erpQty={erpQty} />
        ) : null}
      </div>
    </aside>
  );
}
