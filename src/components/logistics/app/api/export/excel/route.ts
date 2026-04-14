import { NextResponse } from "next/server";
import { getCurrentQty } from "../../../../lib/inventory-calc";
import { getDb, type ItemRow } from "../../../../lib/db";
import { buildInventoryWorkbook, workbookToBuffer } from "../../../../lib/excel-export";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get("keyword") ?? "").trim().toLowerCase();
  const productionType = (searchParams.get("productionType") ?? "all").trim();
  const rows = db.prepare("SELECT * FROM items ORDER BY seq_no ASC").all() as ItemRow[];
  const payload = rows
    .map((row) => ({
      ...row,
      current_qty: getCurrentQty(row.id),
    }))
    .filter((row) => {
      const matchKeyword =
        keyword.length === 0 ||
        row.item_name.toLowerCase().includes(keyword) ||
        (row.erp_code ?? "").toLowerCase().includes(keyword);
      const matchType = productionType === "all" || row.production_type === productionType;
      return matchKeyword && matchType;
    });

  const workbook = buildInventoryWorkbook(payload);
  const buffer = workbookToBuffer(workbook);
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="inventory.xlsx"',
    },
  });
}
