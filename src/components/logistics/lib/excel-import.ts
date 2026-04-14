import * as XLSX from "xlsx";

export interface ImportedMasterRow {
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
  physical_qty: number;
  carryover_qty: number | null;
  snapshot_date: string;
}

export interface ImportedTransactionRow {
  seq_no: number;
  category: string | null;
  item_name: string;
  item_type: string | null;
  production_type: string | null;
  tx_date: string;
  tx_type: "IN_IMPORT" | "IN_DOMESTIC" | "OUT_SALE";
  qty: number;
  unit_price: number | null;
  amount: number | null;
}

function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const month = String(date.m).padStart(2, "0");
      const day = String(date.d).padStart(2, "0");
      return `2026-${month}-${day}`;
    }
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return "2026-01-01";
  }

  const dashPattern = /^(\d{1,2})\/(\d{1,2})(?:-\d+)?$/;
  const dashMatch = text.match(dashPattern);
  if (dashMatch) {
    const month = dashMatch[1].padStart(2, "0");
    const day = dashMatch[2].padStart(2, "0");
    return `2026-${month}-${day}`;
  }

  const normalized = text.replaceAll(".", "-").replaceAll("/", "-");
  const fullDatePattern = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  const fullMatch = normalized.match(fullDatePattern);
  if (fullMatch) {
    const month = fullMatch[2].padStart(2, "0");
    const day = fullMatch[3].padStart(2, "0");
    return `${fullMatch[1]}-${month}-${day}`;
  }

  const mdPattern = /^(\d{1,2})-(\d{1,2})$/;
  const mdMatch = normalized.match(mdPattern);
  if (mdMatch) {
    const month = mdMatch[1].padStart(2, "0");
    const day = mdMatch[2].padStart(2, "0");
    return `2026-${month}-${day}`;
  }

  return "2026-01-01";
}

function getSheetRowsByName(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`시트 '${sheetName}'을(를) 찾을 수 없습니다.`);
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: "",
  });
}

export function parseMasterSheet(buffer: ArrayBuffer): ImportedMasterRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows = getSheetRowsByName(workbook, "품목 마스터");
  const dataRows = rows.slice(3);

  return dataRows
    .map((row) => ({
      seq_no: toNumber(row[0], 0),
      category: toNullableString(row[1]),
      item_type: toNullableString(row[2]),
      production_type: toNullableString(row[3]),
      manufacture_year: toNullableString(row[4]),
      item_name: String(row[5] ?? "").trim(),
      unit: toNullableString(row[6]),
      physical_qty: toNumber(row[7], 0),
      cost_price: toNullableNumber(row[8]),
      carryover_qty: toNullableNumber(row[10]),
      snapshot_date: normalizeDate(row[11]),
      coupang_sku_id: toNullableString(row[12]),
      coupang_item_name: toNullableString(row[13]),
      mapping_accuracy: toNullableString(row[14]),
      mapping_status: toNullableString(row[15]),
      erp_code: toNullableString(row[16]),
      erp_item_name: toNullableString(row[17]),
    }))
    .filter((row) => row.seq_no > 0 && row.item_name.length > 0);
}

export function parseDailyTransactionsSheet(buffer: ArrayBuffer): ImportedTransactionRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows = getSheetRowsByName(workbook, "자사 일별 입출고");
  const dataRows = rows.slice(3);

  return dataRows
    .map((row) => {
      const direction = String(row[6] ?? "").trim();
      const productionType = toNullableString(row[5]);
      let txType: "IN_IMPORT" | "IN_DOMESTIC" | "OUT_SALE" = "OUT_SALE";

      if (direction === "입고") {
        txType = productionType === "수입" ? "IN_IMPORT" : "IN_DOMESTIC";
      } else {
        txType = "OUT_SALE";
      }

      return {
        tx_date: normalizeDate(row[0]),
        seq_no: toNumber(row[1], 0),
        category: toNullableString(row[2]),
        item_name: String(row[3] ?? "").trim(),
        item_type: toNullableString(row[4]),
        production_type: productionType,
        tx_type: txType,
        qty: toNumber(row[7], 0),
        unit_price: toNullableNumber(row[8]),
        amount: toNullableNumber(row[9]),
      };
    })
    .filter((row) => row.seq_no > 0 && row.item_name.length > 0 && row.qty !== 0);
}
