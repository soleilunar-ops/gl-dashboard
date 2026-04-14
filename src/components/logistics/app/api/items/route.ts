import { NextResponse } from "next/server";
import {
  getCurrentQty,
  getSevenDayIncomingQty,
  getSevenDayOutgoingQty,
} from "../../../lib/inventory-calc";
import { getDb } from "../../../lib/db";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM items ORDER BY seq_no ASC").all() as Array<{
    id: number;
    seq_no: number;
    item_name: string;
    manufacture_year: string | null;
    production_type: string | null;
    erp_code: string | null;
    coupang_sku_id: string | null;
    cost_price: number | null;
  }>;

  const erpStmt = db.prepare(
    `SELECT erp_qty
     FROM inventory_snapshots
     WHERE item_id = ?
     ORDER BY snapshot_date DESC, id DESC
     LIMIT 1`
  );

  const payload = rows.map((row) => {
    const currentQty = getCurrentQty(row.id);
    const in7days = getSevenDayIncomingQty(row.id);
    const out7days = getSevenDayOutgoingQty(row.id);
    const erpRow = erpStmt.get(row.id) as { erp_qty: number | null } | undefined;
    const erpQty = erpRow?.erp_qty ?? 0;
    const diff = currentQty - erpQty;
    const costPrice = row.cost_price ?? 0;
    const stockAmount = currentQty * costPrice;

    return {
      id: row.id,
      seq_no: row.seq_no,
      item_name: row.item_name,
      manufacture_year: row.manufacture_year,
      production_type: row.production_type,
      erp_code: row.erp_code,
      coupang_sku_id: row.coupang_sku_id,
      current_qty: currentQty,
      erp_qty: erpQty,
      diff,
      cost_price: costPrice,
      stock_amount: stockAmount,
      in_7days: in7days,
      out_7days: out7days,
    };
  });

  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    seq_no: number;
    item_name: string;
    erp_code?: string;
  };
  const db = getDb();
  const stmt = db.prepare("INSERT INTO items (seq_no, item_name, erp_code) VALUES (?, ?, ?)");
  const result = stmt.run(body.seq_no, body.item_name, body.erp_code ?? null);
  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
}
