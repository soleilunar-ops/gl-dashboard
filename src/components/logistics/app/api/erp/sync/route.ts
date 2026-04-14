import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { getCurrentQty } from "../../../../lib/inventory-calc";
import { getErpStockQtyByCode } from "../../../../lib/erp-client";

export async function GET() {
  try {
    const db = getDb();
    const now = new Date();
    const snapshotDate = now.toISOString().slice(0, 10);
    const syncedAt = now.toISOString();

    const items = db
      .prepare(
        "SELECT id, erp_code FROM items WHERE erp_code IS NOT NULL AND TRIM(erp_code) <> '' ORDER BY seq_no ASC"
      )
      .all() as Array<{ id: number; erp_code: string }>;

    const latestSnapshotStmt = db.prepare(
      `SELECT id
       FROM inventory_snapshots
       WHERE item_id = ?
       ORDER BY snapshot_date DESC, id DESC
       LIMIT 1`
    );
    const updateSnapshotStmt = db.prepare(
      "UPDATE inventory_snapshots SET erp_qty = ?, source = 'erp_sync' WHERE id = ?"
    );
    const insertSnapshotStmt = db.prepare(
      `INSERT INTO inventory_snapshots
        (item_id, snapshot_date, physical_qty, erp_qty, source, note)
       VALUES (?, ?, ?, ?, 'erp_sync', ?)`
    );

    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const erpQty = await getErpStockQtyByCode(item.erp_code);
        const latest = latestSnapshotStmt.get(item.id) as { id: number } | undefined;
        if (latest) {
          updateSnapshotStmt.run(erpQty, latest.id);
        } else {
          insertSnapshotStmt.run(
            item.id,
            snapshotDate,
            getCurrentQty(item.id),
            erpQty,
            "ERP 동기화 시 기준 스냅샷 자동 생성"
          );
        }
        synced += 1;
      } catch {
        failed += 1;
      }
    }

    db.prepare("INSERT INTO erp_sync_log (item_count, status, message) VALUES (?, ?, ?)").run(
      synced,
      failed > 0 ? "partial" : "success",
      `synced=${synced}, failed=${failed}`
    );

    return NextResponse.json({
      synced,
      failed,
      at: syncedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ message }, { status: 500 });
  }
}
