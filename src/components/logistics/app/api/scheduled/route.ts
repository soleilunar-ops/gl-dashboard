import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");
  const db = getDb();
  const rows = itemId
    ? db
        .prepare(
          "SELECT * FROM scheduled_transactions WHERE item_id = ? ORDER BY scheduled_date ASC, id DESC"
        )
        .all(Number(itemId))
    : db.prepare("SELECT * FROM scheduled_transactions ORDER BY scheduled_date ASC, id DESC").all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    item_id: number;
    scheduled_date: string;
    tx_type: string;
    qty: number;
    counterparty?: string;
    status?: "pending" | "confirmed" | "done" | "cancelled";
    note?: string;
  };

  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO scheduled_transactions (item_id, scheduled_date, tx_type, counterparty, qty, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      body.item_id,
      body.scheduled_date,
      body.tx_type,
      body.counterparty ?? null,
      body.qty,
      body.status ?? "pending",
      body.note ?? null
    );

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}
