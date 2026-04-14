import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  const db = getDb();

  if (!itemId) {
    const rows = db
      .prepare("SELECT * FROM transactions ORDER BY tx_date DESC, id DESC LIMIT 300")
      .all();
    return NextResponse.json(rows);
  }

  const rows = db
    .prepare("SELECT * FROM transactions WHERE item_id = ? ORDER BY tx_date DESC, id DESC")
    .all(Number(itemId));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    item_id: number;
    tx_date: string;
    tx_type: string;
    qty: number;
    counterparty?: string;
    unit_price?: number;
    note?: string;
    erp_synced?: number;
  };

  const amount = body.unit_price !== undefined ? body.qty * body.unit_price : null;
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO transactions (item_id, tx_date, tx_type, counterparty, qty, unit_price, amount, note, erp_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      body.item_id,
      body.tx_date,
      body.tx_type,
      body.counterparty ?? null,
      body.qty,
      body.unit_price ?? null,
      amount,
      body.note ?? null,
      body.erp_synced ?? 0
    );

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}
