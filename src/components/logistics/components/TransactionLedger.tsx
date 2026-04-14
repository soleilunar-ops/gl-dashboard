"use client";

import { useEffect, useMemo, useState } from "react";

interface LedgerSummary {
  open_qty: number;
  total_in: number;
  total_out: number;
  close_qty: number;
}

interface LedgerRow {
  id: number;
  tx_date: string;
  tx_type: string;
  counterparty: string | null;
  note: string | null;
  qty: number;
  erp_synced: number;
}

interface LedgerResponse {
  summary: LedgerSummary;
  rows: LedgerRow[];
}

interface TransactionLedgerProps {
  itemId: number;
  refreshKey?: number;
}

type PeriodType = "this_month" | "last_3_months" | "custom";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPeriodRange(period: PeriodType): { from: string; to: string } {
  const now = new Date();
  const to = formatDate(now);

  if (period === "this_month") {
    const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: formatDate(fromDate), to };
  }

  if (period === "last_3_months") {
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: formatDate(fromDate), to };
  }

  return { from: to, to };
}

function getTypeBadge(txType: string): { label: string; className: string } {
  if (txType === "IN_RETURN") {
    return { label: "반품", className: "bg-orange-100 text-orange-700" };
  }
  if (txType === "OUT_ADJUST") {
    return { label: "조정", className: "bg-slate-100 text-slate-700" };
  }
  if (txType.startsWith("IN_")) {
    return { label: "입고", className: "bg-emerald-100 text-emerald-700" };
  }
  return { label: "출고", className: "bg-rose-100 text-rose-700" };
}

function getSignedQty(row: LedgerRow): number {
  if (row.tx_type.startsWith("IN_")) {
    return row.qty;
  }
  if (row.tx_type === "OUT_ADJUST") {
    return -row.qty;
  }
  if (row.tx_type.startsWith("OUT_")) {
    return -row.qty;
  }
  return 0;
}

export function TransactionLedger({ itemId, refreshKey = 0 }: TransactionLedgerProps) {
  const [period, setPeriod] = useState<PeriodType>("this_month");
  const defaultRange = useMemo(() => getPeriodRange("this_month"), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [data, setData] = useState<LedgerResponse>({
    summary: { open_qty: 0, total_in: 0, total_out: 0, close_qty: 0 },
    rows: [],
  });

  useEffect(() => {
    if (period !== "custom") {
      const range = getPeriodRange(period);
      setFrom(range.from);
      setTo(range.to);
    }
  }, [period]);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/items/${itemId}/transactions?from=${from}&to=${to}`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as LedgerResponse;
      setData(payload);
    };

    if (from && to) {
      load();
    }
  }, [itemId, from, to, refreshKey]);

  const ledgerRows = useMemo(() => {
    let running = data.summary.open_qty;
    return data.rows.map((row) => {
      running += getSignedQty(row);
      return { ...row, runningQty: running };
    });
  }, [data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as PeriodType)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="this_month">이번 달</option>
          <option value="last_3_months">최근 3개월</option>
          <option value="custom">직접 선택</option>
        </select>
        {period === "custom" ? (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded border px-2 py-1"
            />
            <span>~</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded border px-2 py-1"
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-4 rounded-lg border bg-slate-50 text-sm">
        <div className="p-3">기초재고 {data.summary.open_qty.toLocaleString()}</div>
        <div className="p-3 text-emerald-700">총입고 {data.summary.total_in.toLocaleString()}</div>
        <div className="p-3 text-rose-700">총출고 {data.summary.total_out.toLocaleString()}</div>
        <div className="p-3">기말재고 {data.summary.close_qty.toLocaleString()}</div>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left">일자</th>
              <th className="px-2 py-2 text-left">유형</th>
              <th className="px-2 py-2 text-left">거래처명</th>
              <th className="px-2 py-2 text-left">적요</th>
              <th className="px-2 py-2 text-right">입고수량</th>
              <th className="px-2 py-2 text-right">출고수량</th>
              <th className="px-2 py-2 text-right">재고수량(누적잔액)</th>
              <th className="px-2 py-2 text-center">ERP반영</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-amber-50/40">
              <td className="px-2 py-2 font-medium" colSpan={4}>
                ◀ 이월재고
              </td>
              <td className="px-2 py-2 text-right">—</td>
              <td className="px-2 py-2 text-right">—</td>
              <td className="px-2 py-2 text-right font-medium">
                {data.summary.open_qty.toLocaleString()}
              </td>
              <td className="px-2 py-2 text-center">—</td>
            </tr>
            {ledgerRows.map((row) => {
              const signedQty = getSignedQty(row);
              const incoming = signedQty > 0 ? signedQty : null;
              const outgoing = signedQty < 0 ? Math.abs(signedQty) : null;
              const badge = getTypeBadge(row.tx_type);
              return (
                <tr key={row.id} className="border-b">
                  <td className="px-2 py-2">{row.tx_date}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.counterparty ?? "—"}</td>
                  <td className="px-2 py-2">{row.note ?? "—"}</td>
                  <td className="px-2 py-2 text-right">
                    {incoming ? incoming.toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {outgoing ? outgoing.toLocaleString() : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">{row.runningQty.toLocaleString()}</td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        row.erp_synced === 1 ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
