import * as XLSX from "xlsx";
import type { ItemRow, TransactionRow } from "./db";

export function buildInventoryWorkbook(rows: Array<ItemRow & { current_qty: number }>) {
  const exportRows = rows.map((row) => ({
    순번: row.seq_no,
    품목명: row.item_name,
    ERP코드: row.erp_code ?? "",
    구분: row.category ?? "",
    유형: row.item_type ?? "",
    현재재고: row.current_qty,
    단위: row.unit ?? "",
    원가: row.cost_price ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "inventory");
  return wb;
}

export function buildLedgerWorkbook(rows: TransactionRow[]) {
  const exportRows = rows.map((row) => ({
    날짜: row.tx_date,
    유형: row.tx_type,
    거래처: row.counterparty ?? "",
    수량: row.qty,
    단가: row.unit_price ?? "",
    금액: row.amount ?? "",
    ERP반영: row.erp_synced === 1 ? "Y" : "N",
    ERP전표번호: row.erp_tx_id ?? "",
    메모: row.note ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ledger");
  return wb;
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });
}
