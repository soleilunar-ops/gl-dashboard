import { getDb } from "./db";

interface SumRow {
  total: number | null;
}

interface SnapshotBaseRow {
  physical_qty: number;
  snapshot_date: string;
}

function getLatestSnapshot(itemId: number): SnapshotBaseRow | null {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT physical_qty, snapshot_date
     FROM inventory_snapshots
     WHERE item_id = ?
     ORDER BY snapshot_date DESC, id DESC
     LIMIT 1`
  );

  return (stmt.get(itemId) as SnapshotBaseRow | undefined) ?? null;
}

export function getCurrentQty(itemId: number): number {
  const db = getDb();
  const snapshot = getLatestSnapshot(itemId);

  if (!snapshot) {
    const fallbackStmt = db.prepare(
      `SELECT SUM(
        CASE
          WHEN tx_type LIKE 'IN_%' THEN qty
          WHEN tx_type = 'OUT_ADJUST' THEN -qty
          WHEN tx_type LIKE 'OUT_%' THEN -qty
          ELSE 0
        END
      ) AS total
      FROM transactions
      WHERE item_id = ?`
    );

    const fallback = fallbackStmt.get(itemId) as SumRow | undefined;
    return fallback?.total ?? 0;
  }

  const inStmt = db.prepare(
    `SELECT SUM(qty) AS total
     FROM transactions
     WHERE item_id = ?
       AND tx_date > ?
       AND tx_type LIKE 'IN_%'`
  );
  const outStmt = db.prepare(
    `SELECT SUM(
      CASE
        WHEN tx_type = 'OUT_ADJUST' THEN qty
        ELSE qty
      END
    ) AS total
    FROM transactions
    WHERE item_id = ?
      AND tx_date > ?
      AND tx_type LIKE 'OUT_%'`
  );

  const inSum = (inStmt.get(itemId, snapshot.snapshot_date) as SumRow | undefined)?.total ?? 0;
  const outSum = (outStmt.get(itemId, snapshot.snapshot_date) as SumRow | undefined)?.total ?? 0;

  return snapshot.physical_qty + inSum - outSum;
}

export function getSevenDayIncomingQty(itemId: number, baseDate = new Date()): number {
  const db = getDb();
  const from = baseDate.toISOString().slice(0, 10);
  const toDate = new Date(baseDate);
  toDate.setDate(toDate.getDate() + 7);
  const to = toDate.toISOString().slice(0, 10);

  const stmt = db.prepare(
    `SELECT SUM(qty) AS total
     FROM scheduled_transactions
     WHERE item_id = ?
       AND scheduled_date >= ?
       AND scheduled_date <= ?
       AND status IN ('pending', 'confirmed')
       AND tx_type LIKE 'IN_%'`
  );

  const row = stmt.get(itemId, from, to) as SumRow | undefined;
  return row?.total ?? 0;
}

export function getSevenDayOutgoingQty(itemId: number, baseDate = new Date()): number {
  const db = getDb();
  const from = baseDate.toISOString().slice(0, 10);
  const toDate = new Date(baseDate);
  toDate.setDate(toDate.getDate() + 7);
  const to = toDate.toISOString().slice(0, 10);

  const stmt = db.prepare(
    `SELECT SUM(qty) AS total
     FROM scheduled_transactions
     WHERE item_id = ?
       AND scheduled_date >= ?
       AND scheduled_date <= ?
       AND status IN ('pending', 'confirmed')
       AND tx_type IN ('OUT_ORDER', 'OUT_QUOTE')`
  );

  const row = stmt.get(itemId, from, to) as SumRow | undefined;
  return row?.total ?? 0;
}
