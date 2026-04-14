import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const scheduledId = Number(id);
  const body = (await request.json()) as {
    status?: "pending" | "confirmed" | "done" | "cancelled";
    scheduled_date?: string;
    tx_type?: string;
    counterparty?: string;
    qty?: number;
    note?: string;
  };
  const db = getDb();

  db.prepare(
    `UPDATE scheduled_transactions
     SET
       status = COALESCE(?, status),
       scheduled_date = COALESCE(?, scheduled_date),
       tx_type = COALESCE(?, tx_type),
       counterparty = COALESCE(?, counterparty),
       qty = COALESCE(?, qty),
       note = COALESCE(?, note)
     WHERE id = ?`
  ).run(
    body.status ?? null,
    body.scheduled_date ?? null,
    body.tx_type ?? null,
    body.counterparty ?? null,
    body.qty ?? null,
    body.note ?? null,
    scheduledId
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const scheduledId = Number(id);
  const db = getDb();
  db.prepare("DELETE FROM scheduled_transactions WHERE id = ?").run(scheduledId);
  return NextResponse.json({ success: true });
}
