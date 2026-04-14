import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "src", "components", "logistics", ".data");
const dbPath = path.join(dataDir, "inventory.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq_no INTEGER NOT NULL,
      category TEXT,
      item_type TEXT,
      production_type TEXT,
      manufacture_year TEXT,
      item_name TEXT NOT NULL,
      unit TEXT,
      cost_price REAL,
      erp_code TEXT,
      erp_item_name TEXT,
      coupang_sku_id TEXT,
      coupang_item_name TEXT,
      mapping_accuracy TEXT,
      mapping_status TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      snapshot_date TEXT NOT NULL,
      physical_qty INTEGER NOT NULL,
      erp_qty INTEGER,
      carryover_qty INTEGER,
      source TEXT DEFAULT 'manual',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      tx_date TEXT NOT NULL,
      tx_type TEXT NOT NULL,
      counterparty TEXT,
      qty INTEGER NOT NULL,
      unit_price REAL,
      amount REAL,
      erp_synced INTEGER DEFAULT 0,
      erp_tx_id TEXT,
      source TEXT DEFAULT 'manual',
      note TEXT,
      created_by TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      scheduled_date TEXT NOT NULL,
      tx_type TEXT NOT NULL,
      counterparty TEXT,
      qty INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS erp_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      item_count INTEGER,
      status TEXT,
      message TEXT
    );
  `);
}

migrate();

export type TxType = "IN_IMPORT" | "IN_DOMESTIC" | "IN_RETURN" | "OUT_SALE" | "OUT_ADJUST";
export type ScheduledTxType = "IN_IMPORT" | "IN_DOMESTIC" | "IN_RETURN" | "OUT_ORDER" | "OUT_QUOTE";

export interface ItemRow {
  id: number;
  seq_no: number;
  category: string | null;
  item_type: string | null;
  production_type: string | null;
  manufacture_year: string | null;
  item_name: string;
  unit: string | null;
  cost_price: number | null;
  erp_code: string | null;
  erp_item_name: string | null;
  coupang_sku_id: string | null;
  coupang_item_name: string | null;
  mapping_accuracy: string | null;
  mapping_status: string | null;
  is_active: number;
  created_at: string;
}

export interface SnapshotRow {
  id: number;
  item_id: number;
  snapshot_date: string;
  physical_qty: number;
  erp_qty: number | null;
  carryover_qty: number | null;
  source: string;
  note: string | null;
  created_at: string;
}

export interface TransactionRow {
  id: number;
  item_id: number;
  tx_date: string;
  tx_type: TxType;
  counterparty: string | null;
  qty: number;
  unit_price: number | null;
  amount: number | null;
  erp_synced: number;
  erp_tx_id: string | null;
  source: string;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface ScheduledRow {
  id: number;
  item_id: number;
  scheduled_date: string;
  tx_type: ScheduledTxType;
  counterparty: string | null;
  qty: number;
  status: "pending" | "confirmed" | "done" | "cancelled";
  note: string | null;
  created_at: string;
}

export function getDb() {
  return db;
}
