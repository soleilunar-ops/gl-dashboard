import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

interface TxRow {
  id: number;
  tx_date: string;
  tx_type: string;
  counterparty: string | null;
  note: string | null;
  qty: number;
  erp_synced: number;
}

function getSignedQty(txType: string, qty: number): number {
  if (txType.startsWith("IN_")) {
    return qty;
  }
  if (txType === "OUT_ADJUST") {
    return -qty;
  }
  if (txType.startsWith("OUT_")) {
    return -qty;
  }
  return 0;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const itemId = Number(id);
  const { searchParams } = new URL(request.url);
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);
  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;
  const db = getDb();

  const latestSnapshot = db
    .prepare(
      `SELECT snapshot_date, physical_qty
       FROM inventory_snapshots
       WHERE item_id = ? AND snapshot_date <= ?
       ORDER BY snapshot_date DESC, id DESC
       LIMIT 1`
    )
    .get(itemId, from) as { snapshot_date: string; physical_qty: number } | undefined;

  const preTxRows = db
    .prepare(
      `SELECT tx_type, qty
       FROM transactions
       WHERE item_id = ? AND tx_date < ?
       ORDER BY tx_date ASC, id ASC`
    )
    .all(itemId, from) as Array<{ tx_type: string; qty: number }>;

  const openQtyBase = latestSnapshot?.physical_qty ?? 0;
  const openQty = preTxRows.reduce(
    (acc, row) => acc + getSignedQty(row.tx_type, row.qty),
    openQtyBase
  );

  const periodRows = db
    .prepare(
      `SELECT id, tx_date, tx_type, counterparty, note, qty, erp_synced
       FROM transactions
       WHERE item_id = ? AND tx_date >= ? AND tx_date <= ?
       ORDER BY tx_date ASC, id ASC`
    )
    .all(itemId, from, to) as TxRow[];

  let totalIn = 0;
  let totalOut = 0;
  for (const row of periodRows) {
    const signed = getSignedQty(row.tx_type, row.qty);
    if (signed > 0) {
      totalIn += signed;
    } else if (signed < 0) {
      totalOut += Math.abs(signed);
    }
  }

  const closeQty = openQty + totalIn - totalOut;

  return NextResponse.json({
    summary: {
      open_qty: openQty,
      total_in: totalIn,
      total_out: totalOut,
      close_qty: closeQty,
    },
    rows: periodRows,
  });
}
