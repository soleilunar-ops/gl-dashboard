"use client";

import { useEffect, useMemo, useState } from "react";

type TxType = "IN_IMPORT" | "IN_DOMESTIC" | "IN_RETURN" | "OUT_SALE" | "OUT_ADJUST";

interface TransactionFormProps {
  itemId: number;
  defaultUnitPrice?: number;
  onSubmitted?: () => void;
}

interface CounterpartyRow {
  counterparty: string | null;
}

export function TransactionForm({
  itemId,
  defaultUnitPrice = 0,
  onSubmitted,
}: TransactionFormProps) {
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txType, setTxType] = useState<TxType>("OUT_SALE");
  const [qty, setQty] = useState<number>(0);
  const [counterparty, setCounterparty] = useState("");
  const [unitPrice, setUnitPrice] = useState<number>(defaultUnitPrice);
  const [note, setNote] = useState("");
  const [erpSynced, setErpSynced] = useState(false);
  const [counterpartyHistory, setCounterpartyHistory] = useState<string[]>([]);

  useEffect(() => {
    const loadCounterpartyHistory = async () => {
      const response = await fetch(`/api/transactions?itemId=${itemId}`);
      if (!response.ok) {
        return;
      }
      const rows = (await response.json()) as CounterpartyRow[];
      const unique = Array.from(
        new Set(
          rows
            .map((row) => row.counterparty?.trim())
            .filter((value): value is string => Boolean(value))
        )
      );
      setCounterpartyHistory(unique);
    };

    loadCounterpartyHistory();
  }, [itemId]);

  const txOptions = useMemo(
    () =>
      [
        { value: "IN_IMPORT", label: "중국수입 입고" },
        { value: "IN_DOMESTIC", label: "국내생산 입고" },
        { value: "IN_RETURN", label: "반품 입고" },
        { value: "OUT_SALE", label: "판매 출고" },
        { value: "OUT_ADJUST", label: "재고조정" },
      ] as const,
    []
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: itemId,
        tx_date: txDate,
        tx_type: txType,
        qty,
        counterparty,
        unit_price: unitPrice,
        note,
        erp_synced: erpSynced ? 1 : 0,
      }),
    });

    setQty(0);
    setNote("");
    onSubmitted?.();
  };

  return (
    <form className="space-y-3 rounded-lg border bg-white p-4" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold">직접 입력</h3>

      <select
        className="w-full rounded border px-3 py-2 text-sm"
        value={txType}
        onChange={(event) => setTxType(event.target.value as TxType)}
      >
        {txOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <input
        className="w-full rounded border px-3 py-2 text-sm"
        type="date"
        value={txDate}
        onChange={(event) => setTxDate(event.target.value)}
      />
      <input
        className="w-full rounded border px-3 py-2 text-sm"
        type="number"
        placeholder="수량"
        value={qty}
        onChange={(event) => setQty(Number(event.target.value))}
      />

      <input
        className="w-full rounded border px-3 py-2 text-sm"
        type="text"
        list={`counterparty-list-${itemId}`}
        placeholder="거래처명"
        value={counterparty}
        onChange={(event) => setCounterparty(event.target.value)}
      />
      <datalist id={`counterparty-list-${itemId}`}>
        {counterpartyHistory.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <input
        className="w-full rounded border px-3 py-2 text-sm"
        type="number"
        placeholder="단가"
        value={unitPrice}
        onChange={(event) => setUnitPrice(Number(event.target.value))}
      />
      <input
        className="w-full rounded border px-3 py-2 text-sm"
        type="text"
        placeholder="적요"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={erpSynced}
          onChange={(event) => setErpSynced(event.target.checked)}
        />
        ERP 반영 여부
      </label>

      <button
        type="submit"
        className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
      >
        저장
      </button>
    </form>
  );
}
