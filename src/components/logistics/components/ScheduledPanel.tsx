"use client";

import { useEffect, useState } from "react";

type ScheduledStatus = "pending" | "confirmed" | "done" | "cancelled";

interface ScheduledItem {
  id: number;
  scheduled_date: string;
  tx_type: string;
  counterparty: string | null;
  qty: number;
  status: ScheduledStatus;
  note: string | null;
}

interface ScheduledPanelProps {
  itemId: number;
}

interface CreateFormState {
  scheduled_date: string;
  tx_type: string;
  counterparty: string;
  qty: number;
  status: ScheduledStatus;
  note: string;
}

const initialForm: CreateFormState = {
  scheduled_date: new Date().toISOString().slice(0, 10),
  tx_type: "OUT_ORDER",
  counterparty: "",
  qty: 0,
  status: "pending",
  note: "",
};

function getStatusMeta(status: ScheduledStatus) {
  if (status === "pending") return { label: "대기", className: "bg-amber-100 text-amber-700" };
  if (status === "confirmed")
    return { label: "확정", className: "bg-emerald-100 text-emerald-700" };
  if (status === "done") return { label: "완료", className: "bg-slate-200 text-slate-700" };
  return { label: "취소", className: "bg-rose-100 text-rose-700" };
}

export function ScheduledPanel({ itemId }: ScheduledPanelProps) {
  const [rows, setRows] = useState<ScheduledItem[]>([]);
  const [form, setForm] = useState<CreateFormState>(initialForm);

  const loadRows = async () => {
    const response = await fetch(`/api/scheduled?item_id=${itemId}`);
    if (!response.ok) return;
    const payload = (await response.json()) as ScheduledItem[];
    setRows(payload);
  };

  useEffect(() => {
    loadRows();
  }, [itemId]);

  const handleStatusAdvance = async (row: ScheduledItem) => {
    const nextStatus: ScheduledStatus =
      row.status === "pending" ? "confirmed" : row.status === "confirmed" ? "done" : row.status;
    if (nextStatus === row.status) return;

    await fetch(`/api/scheduled/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadRows();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/scheduled/${id}`, { method: "DELETE" });
    await loadRows();
  };

  const handleAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetch("/api/scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: itemId,
        ...form,
      }),
    });
    setForm(initialForm);
    await loadRows();
  };

  return (
    <div className="space-y-4">
      <div className="max-h-[300px] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 text-left">예정일</th>
              <th className="px-2 py-2 text-left">유형</th>
              <th className="px-2 py-2 text-left">거래처명</th>
              <th className="px-2 py-2 text-right">수량</th>
              <th className="px-2 py-2 text-left">상태</th>
              <th className="px-2 py-2 text-left">액션</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = getStatusMeta(row.status);
              return (
                <tr key={row.id} className="border-b">
                  <td className="px-2 py-2">{row.scheduled_date}</td>
                  <td className="px-2 py-2">{row.tx_type}</td>
                  <td className="px-2 py-2">{row.counterparty ?? "—"}</td>
                  <td className="px-2 py-2 text-right">{row.qty.toLocaleString()}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${meta.className}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusAdvance(row)}
                        className="rounded border px-2 py-1 text-xs"
                        disabled={row.status !== "pending" && row.status !== "confirmed"}
                      >
                        상태변경
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        className="rounded border px-2 py-1 text-xs text-rose-600"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm">
        <input
          type="date"
          className="rounded border px-2 py-1.5"
          value={form.scheduled_date}
          onChange={(e) => setForm((prev) => ({ ...prev, scheduled_date: e.target.value }))}
        />
        <select
          className="rounded border px-2 py-1.5"
          value={form.tx_type}
          onChange={(e) => setForm((prev) => ({ ...prev, tx_type: e.target.value }))}
        >
          <option value="IN_IMPORT">IN_IMPORT</option>
          <option value="IN_DOMESTIC">IN_DOMESTIC</option>
          <option value="IN_RETURN">IN_RETURN</option>
          <option value="OUT_ORDER">OUT_ORDER</option>
          <option value="OUT_QUOTE">OUT_QUOTE</option>
        </select>
        <input
          className="rounded border px-2 py-1.5"
          placeholder="거래처명"
          value={form.counterparty}
          onChange={(e) => setForm((prev) => ({ ...prev, counterparty: e.target.value }))}
        />
        <input
          type="number"
          className="rounded border px-2 py-1.5"
          placeholder="수량"
          value={form.qty}
          onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))}
        />
        <select
          className="rounded border px-2 py-1.5"
          value={form.status}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, status: e.target.value as ScheduledStatus }))
          }
        >
          <option value="pending">대기</option>
          <option value="confirmed">확정</option>
          <option value="done">완료</option>
          <option value="cancelled">취소</option>
        </select>
        <input
          className="rounded border px-2 py-1.5"
          placeholder="비고"
          value={form.note}
          onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
        />
        <button
          type="submit"
          className="col-span-2 rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
        >
          추가
        </button>
      </form>
    </div>
  );
}
