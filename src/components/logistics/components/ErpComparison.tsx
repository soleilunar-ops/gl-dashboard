"use client";

import { useEffect, useMemo, useState } from "react";

interface ErpComparisonProps {
  itemId: number;
  physicalQty: number;
  erpQty: number;
}

interface ErpLedgerRow {
  [key: string]: unknown;
}

function pickNumber(row: ErpLedgerRow, candidates: string[]): number {
  for (const key of candidates) {
    const value = row[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function pickText(row: ErpLedgerRow, candidates: string[]): string {
  for (const key of candidates) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "-";
}

export function ErpComparison({ itemId, physicalQty, erpQty }: ErpComparisonProps) {
  const [rows, setRows] = useState<ErpLedgerRow[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const diff = physicalQty - erpQty;

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10).replaceAll("-", "");
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);
  const defaultFrom = fromDate.toISOString().slice(0, 10).replaceAll("-", "");

  const warningMessage = useMemo(() => {
    if (diff === 0) {
      return "실물과 ERP 재고가 일치합니다.";
    }
    if (diff > 0) {
      return `실물이 ERP보다 ${diff.toLocaleString()}개 많음 — 미반영 입고 확인 필요`;
    }
    return `ERP가 실물보다 ${Math.abs(diff).toLocaleString()}개 많음 — 미반영 출고 확인 필요`;
  }, [diff]);

  const loadLedger = async () => {
    const response = await fetch(`/api/erp/ledger/${itemId}?from=${defaultFrom}&to=${defaultTo}`);
    if (!response.ok) {
      setRows([]);
      return;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const candidates = [payload?.Data, payload?.data, payload?.List, payload?.list];
    const firstArray = candidates.find((value) => Array.isArray(value)) as
      | ErpLedgerRow[]
      | undefined;
    setRows(firstArray ?? []);
  };

  useEffect(() => {
    loadLedger();
  }, [itemId]);

  const handleResync = async () => {
    const response = await fetch("/api/erp/sync");
    if (!response.ok) {
      setSyncMessage("ERP 재동기화 실패");
      return;
    }
    const payload = (await response.json()) as { synced: number; failed: number; at: string };
    setSyncMessage(`ERP 재동기화 완료 (성공 ${payload.synced} / 실패 ${payload.failed})`);
    await loadLedger();
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <h3 className="text-base font-semibold">ERP 비교</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded border p-3">실물재고: {physicalQty.toLocaleString()}</div>
        <div className="rounded border p-3">ERP재고: {erpQty.toLocaleString()}</div>
      </div>
      <p className={`text-sm font-medium ${diff === 0 ? "text-emerald-700" : "text-rose-600"}`}>
        {warningMessage}
      </p>
      <button
        type="button"
        onClick={handleResync}
        className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
      >
        ERP 재동기화
      </button>
      {syncMessage ? <p className="text-xs text-gray-600">{syncMessage}</p> : null}

      <div className="max-h-[280px] overflow-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left">일자</th>
              <th className="px-2 py-2 text-right">입고</th>
              <th className="px-2 py-2 text-right">출고</th>
              <th className="px-2 py-2 text-right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${pickText(row, ["SEQ", "seq", "NO", "no"])}-${index}`}
                className="border-b"
              >
                <td className="px-2 py-2">
                  {pickText(row, ["DATE", "date", "IO_DATE", "io_date"])}
                </td>
                <td className="px-2 py-2 text-right">
                  {pickNumber(row, ["IN_QTY", "in_qty", "IN", "in"]).toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right">
                  {pickNumber(row, ["OUT_QTY", "out_qty", "OUT", "out"]).toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right">
                  {pickNumber(row, [
                    "BAL_QTY",
                    "bal_qty",
                    "STOCK_QTY",
                    "stock_qty",
                  ]).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
