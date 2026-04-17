import * as XLSX from "xlsx";

// 변경 이유: 제출용-입출고자료.xlsx 「구매현황」 시트와 동일한 열 구조로 파싱·다운로드합니다.

export const PURCHASE_EXCEL_SHEET_NAME = "구매현황";

/** 템플릿 상단 문구(다운로드 시 첫 데이터 행 직전까지) */
export const PURCHASE_EXCEL_META_LINE =
  "회사명 : (주)지엘 / 하루온군인핫팩(160g) 외 6건 / 수입 / 2025/01/01  ~ 2026/04/05 ";

export type PurchaseExcelParsedRow = {
  /** 원본 일자-No. 표기(전표 식별용) */
  dateNoRaw: string;
  erpRef: string;
  purchaseDateIso: string;
  erpCode: string;
  productName: string;
  quantity: number;
  unitPriceCny: number;
  supplyAmount: number;
  vatAmount: number;
  totalCny: number;
  supplierName: string;
  remark: string;
};

export type PurchaseExcelParseResult = {
  rows: PurchaseExcelParsedRow[];
  errors: string[];
};

function normHeader(cell: unknown): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  return String(cell).replace(/\s+/g, "").toLowerCase();
}

function toNum(v: unknown): number {
  if (v === "" || v === null || v === undefined) {
    return 0;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  return String(v).trim();
}

/** '2025/01/02-1' 또는 '2026/02/20 -1' 형태에서 날짜·전표접미 파싱 */
export function parseDateNoCell(raw: string): { erpRef: string; purchaseDateIso: string } | null {
  const s = raw.trim().replace(/\s*-\s*/g, "-");
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})-(\d+)$/);
  if (!m) {
    return null;
  }
  const [, y, mo, d] = m;
  const purchaseDateIso = `${y}-${mo}-${d}`;
  const erpRef = `${y}/${mo}/${d}-${m[4]}`;
  return { erpRef, purchaseDateIso };
}

type HeaderKey =
  | "dateNo"
  | "erpCode"
  | "productName"
  | "quantity"
  | "unitPrice"
  | "supply"
  | "vat"
  | "total"
  | "supplier"
  | "remark";

const HEADER_PATTERNS: { key: HeaderKey; patterns: string[] }[] = [
  { key: "dateNo", patterns: ["일자-no."] },
  { key: "erpCode", patterns: ["품목코드"] },
  { key: "productName", patterns: ["품목명(규격)", "품목명"] },
  { key: "quantity", patterns: ["수량"] },
  { key: "unitPrice", patterns: ["단가(cny)"] },
  { key: "supply", patterns: ["공급가액"] },
  { key: "vat", patterns: ["부가세"] },
  { key: "total", patterns: ["합계"] },
  { key: "supplier", patterns: ["거래처명"] },
  { key: "remark", patterns: ["비고"] },
];

function matchHeaderKey(norm: string): HeaderKey | null {
  for (const { key, patterns } of HEADER_PATTERNS) {
    for (const p of patterns) {
      if (norm === p || norm.includes(p)) {
        return key;
      }
    }
  }
  return null;
}

function findHeaderRowIndex(
  matrix: unknown[][]
): { row: number; colMap: Record<HeaderKey, number> } | null {
  for (let r = 0; r < Math.min(matrix.length, 40); r += 1) {
    const row = matrix[r] ?? [];
    const colMap: Partial<Record<HeaderKey, number>> = {};
    for (let c = 0; c < row.length; c += 1) {
      const key = matchHeaderKey(normHeader(row[c]));
      if (key && colMap[key] === undefined) {
        colMap[key] = c;
      }
    }
    const keys = Object.keys(colMap) as HeaderKey[];
    if (keys.length >= 5 && colMap.dateNo !== undefined && colMap.erpCode !== undefined) {
      return { row: r, colMap: colMap as Record<HeaderKey, number> };
    }
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function deriveVatFromTotal(gross: number): { supply: number; vat: number } {
  const supply = round2(gross / 1.1);
  const vat = round2(gross - supply);
  return { supply, vat };
}

export function parsePurchaseExcelBuffer(buffer: ArrayBuffer): PurchaseExcelParseResult {
  const errors: string[] = [];
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames.includes(PURCHASE_EXCEL_SHEET_NAME)
    ? PURCHASE_EXCEL_SHEET_NAME
    : workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["시트를 찾을 수 없습니다."] };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  const found = findHeaderRowIndex(matrix);
  if (!found) {
    return { rows: [], errors: ["헤더 행(일자-No., 품목코드 …)을 찾지 못했습니다."] };
  }

  const { row: headerRow, colMap } = found;
  const rows: PurchaseExcelParsedRow[] = [];

  for (let r = headerRow + 1; r < matrix.length; r += 1) {
    const line = matrix[r] ?? [];
    const dateNoRaw = toStr(colMap.dateNo !== undefined ? line[colMap.dateNo] : "");
    if (!dateNoRaw) {
      const code = toStr(colMap.erpCode !== undefined ? line[colMap.erpCode] : "");
      if (!code) {
        continue;
      }
      errors.push(`${r + 1}행: 일자-No.가 비어 있어 건너뜁니다.`);
      continue;
    }

    const parsed = parseDateNoCell(dateNoRaw);
    if (!parsed) {
      errors.push(`${r + 1}행: 일자-No. 형식을 해석할 수 없습니다 (${dateNoRaw}).`);
      continue;
    }

    const erpCode = toStr(colMap.erpCode !== undefined ? line[colMap.erpCode] : "");
    const productName = toStr(colMap.productName !== undefined ? line[colMap.productName] : "");
    const quantity = Math.trunc(toNum(colMap.quantity !== undefined ? line[colMap.quantity] : 0));
    const unitPriceCny = round2(toNum(colMap.unitPrice !== undefined ? line[colMap.unitPrice] : 0));
    let supplyAmount = round2(toNum(colMap.supply !== undefined ? line[colMap.supply] : 0));
    let vatAmount = round2(toNum(colMap.vat !== undefined ? line[colMap.vat] : 0));
    let totalCny = round2(toNum(colMap.total !== undefined ? line[colMap.total] : 0));

    if (quantity <= 0) {
      errors.push(`${r + 1}행: 수량이 0 이하여 건너뜁니다.`);
      continue;
    }

    if (totalCny <= 0 && unitPriceCny > 0) {
      totalCny = round2(quantity * unitPriceCny);
    }
    if (totalCny > 0 && (supplyAmount <= 0 || vatAmount <= 0)) {
      const d = deriveVatFromTotal(totalCny);
      supplyAmount = d.supply;
      vatAmount = d.vat;
    }

    const supplierName = toStr(colMap.supplier !== undefined ? line[colMap.supplier] : "");
    const remark = toStr(colMap.remark !== undefined ? line[colMap.remark] : "");

    rows.push({
      dateNoRaw,
      erpRef: parsed.erpRef,
      purchaseDateIso: parsed.purchaseDateIso,
      erpCode,
      productName,
      quantity,
      unitPriceCny,
      supplyAmount,
      vatAmount,
      totalCny,
      supplierName,
      remark,
    });
  }

  return { rows, errors };
}

export type PurchaseRowForExport = {
  erp_ref: string | null;
  purchase_date: string;
  erp_code: string | null;
  erp_product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  supplier_name: string | null;
  /** 비고 — 수동/업로드 메타용 (기업/출처) */
  remark?: string;
};

/** DB·통합 목록 → 제출용 구매현황 시트와 동일한 2차원 배열 */
export function buildPurchaseSheetMatrix(rows: PurchaseRowForExport[]): (string | number)[][] {
  const headerRow: (string | number)[] = [
    "일자-No.",
    "품목코드",
    "품목명(규격)",
    "수량",
    "단가 (CNY)",
    "공급가액",
    "부가세",
    "합계",
    "거래처명",
    "비고",
  ];

  const out: (string | number)[][] = [
    ["구매현황", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", ""],
    [PURCHASE_EXCEL_META_LINE, "", "", "", "", "", "", "", "", ""],
    headerRow,
  ];

  for (const row of rows) {
    const qty = row.quantity ?? 0;
    const unit =
      row.unit_price !== null && row.unit_price !== undefined ? round2(Number(row.unit_price)) : 0;
    let total =
      row.amount !== null && row.amount !== undefined && Number(row.amount) > 0
        ? round2(Number(row.amount))
        : round2(qty * unit);
    if (total <= 0 && qty > 0 && unit > 0) {
      total = round2(qty * unit);
    }
    const { supply, vat } = deriveVatFromTotal(total > 0 ? total : round2(qty * unit));
    const dateParts = row.purchase_date.slice(0, 10).split("-");
    const y = dateParts[0] ?? "";
    const m = dateParts[1] ?? "";
    const d = dateParts[2] ?? "";
    const dateNo = row.erp_ref && row.erp_ref.includes("/") ? row.erp_ref : `${y}/${m}/${d}-1`;

    out.push([
      dateNo,
      row.erp_code ?? "",
      row.erp_product_name ?? "",
      qty,
      unit,
      supply,
      vat,
      total > 0 ? total : round2(qty * unit),
      row.supplier_name ?? "",
      row.remark ?? "",
    ]);
  }

  return out;
}

export function downloadPurchaseExcel(rows: PurchaseRowForExport[], filename: string): void {
  const matrix = buildPurchaseSheetMatrix(rows);
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, PURCHASE_EXCEL_SHEET_NAME);
  XLSX.writeFile(workbook, filename);
}
