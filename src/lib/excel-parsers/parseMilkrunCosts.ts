/**
 * 밀크런 비용 milkrun_sales_*.xls — 내부 HTML, `<table>` 여러 개, 각 테이블에서 첫 `<tr>`=요약 무시·둘째 `<tr>`=헤더
 */
import * as XLSX from "xlsx";
import type { InsertTables } from "@/lib/supabase/types";
import { normalizeDateCell, parseNumberKo, yearMonthFromIsoDate } from "./parsingUtils";

export type ParsedMilkrunRow = InsertTables<"promotion_milkrun_costs"> & { is_baseline: false };

/** 파일명 milkrun_sales_YYYY-MM → 픽업일이 없을 때만 보조 year_month */
export function yearMonthFromMilkrunFileName(name: string): string | null {
  const m = /milkrun_sales_(\d{4})-(\d{2})/i.exec(name);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function normHeader(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 헤더 이름으로 열 인덱스 (완전 일치만) */
function headerCellIndex(headers: string[], ...names: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const cell = normHeader(headers[i] ?? "");
    for (const n of names) {
      if (cell === normHeader(n)) return i;
    }
  }
  return -1;
}

/**
 * 18열 고정 순서(정산번호…총 합계 금액)일 때 인덱스
 * 0 정산번호, 5 센터, 6 픽업일, 8 팔레트 수량, 15 월 발생금액, 17 총 합계 금액
 */
const FIXED_18 = {
  settle: 0,
  center: 5,
  pickup: 6,
  pallet: 8,
  monthly: 15,
  totalInclTax: 17,
} as const;

type ColIdx = {
  settle: number;
  center: number;
  pickup: number;
  pallet: number;
  monthly: number;
  totalInclTax: number;
};

function resolveMilkrunColumnIndices(headerCells: string[]): ColIdx | null {
  const settle = headerCellIndex(headerCells, "정산번호");
  const center = headerCellIndex(headerCells, "센터");
  const pickup = headerCellIndex(headerCells, "픽업일");
  const pallet = headerCellIndex(headerCells, "팔레트 수량", "팔레트수량");
  const monthly = headerCellIndex(headerCells, "월 발생금액", "월발생금액");
  const totalInclTax = headerCellIndex(
    headerCells,
    "총 합계 금액",
    "총합계금액",
    "총 금액",
    "총금액"
  );

  if (headerCells.length >= 18 && normHeader(headerCells[0] ?? "") === normHeader("정산번호")) {
    return FIXED_18;
  }

  if (settle >= 0 && pickup >= 0 && monthly >= 0) {
    return {
      settle,
      center: center >= 0 ? center : -1,
      pickup,
      pallet: pallet >= 0 ? pallet : -1,
      monthly,
      totalInclTax: totalInclTax >= 0 ? totalInclTax : -1,
    };
  }

  return null;
}

/** 센터 + " 팔레트 " + 수량 + "개" */
function buildDescription(center: string, palletQty: string): string {
  const c = center.trim();
  const q = String(palletQty ?? "").trim();
  return `${c} 팔레트 ${q}개`.trim();
}

function parseOneHtmlTable(table: HTMLTableElement): ParsedMilkrunRow[] {
  const trs = [...table.querySelectorAll("tr")];
  if (trs.length < 3) return [];

  // 변경 이유: 파일마다 요약행/제목행이 끼어 헤더 위치가 고정되지 않아, 헤더 내용을 기준으로 탐지합니다.
  let headerRowIndex = -1;
  let col: ReturnType<typeof resolveMilkrunColumnIndices> = null;
  for (let i = 0; i < trs.length; i++) {
    const cells = [...trs[i]!.querySelectorAll("th,td")].map((c) => c.textContent?.trim() ?? "");
    const found = resolveMilkrunColumnIndices(cells);
    if (found) {
      headerRowIndex = i;
      col = found;
      break;
    }
  }
  if (!col) return [];

  const out: ParsedMilkrunRow[] = [];

  for (let r = headerRowIndex + 1; r < trs.length; r++) {
    const cells = [...trs[r]!.querySelectorAll("th,td")].map((c) => c.textContent?.trim() ?? "");
    const needLen =
      Math.max(col.settle, col.pickup, col.monthly, col.totalInclTax, col.center, col.pallet) + 1;
    if (cells.length < needLen) continue;

    const settleNo = String(cells[col.settle] ?? "").trim();
    if (!settleNo) continue;

    const pickupRaw = cells[col.pickup] ?? "";
    const deliveryDate = normalizeDateCell(pickupRaw);
    if (!deliveryDate) continue;

    const yearMonth = yearMonthFromIsoDate(deliveryDate);
    const amount =
      (col.totalInclTax >= 0 ? parseNumberKo(cells[col.totalInclTax]) : null) ??
      parseNumberKo(cells[col.monthly]);
    if (amount == null) continue;

    const center = col.center >= 0 ? String(cells[col.center] ?? "").trim() : "";
    const palletQty = col.pallet >= 0 ? String(cells[col.pallet] ?? "").trim() : "";
    const description = buildDescription(center, palletQty);

    out.push({
      year_month: yearMonth,
      amount,
      delivery_date: deliveryDate,
      description,
      season: null,
      is_baseline: false,
    });
  }

  return out;
}

function parseMilkrunHtmlDocument(html: string, fileDefaultYm: string | null): ParsedMilkrunRow[] {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    throw new Error("밀크런 HTML 파일은 브라우저에서만 처리할 수 있습니다.");
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = [...doc.querySelectorAll("table")];
  if (!tables.length) {
    throw new Error("밀크런 파일에서 표를 찾을 수 없습니다.");
  }

  const merged: ParsedMilkrunRow[] = [];
  for (const table of tables) {
    merged.push(...parseOneHtmlTable(table));
  }

  if (!merged.length) {
    throw new Error(
      "유효한 밀크런 데이터 행이 없습니다. 첫 행은 요약, 둘째 행은 헤더(정산번호·픽업일·월 발생금액 등)인지 확인해 주세요."
    );
  }

  if (fileDefaultYm) {
    for (const row of merged) {
      if (!row.year_month || row.year_month.length < 7) {
        row.year_month = fileDefaultYm;
      }
    }
  }

  return merged;
}

function parseMilkrunBinaryMatrix(
  matrix: unknown[][],
  defaultYm: string | null
): ParsedMilkrunRow[] {
  if (matrix.length < 2) throw new Error("시트에 데이터가 없습니다.");
  const headerCells = (matrix[0] as unknown[]).map((c) => String(c ?? "").trim());
  const col = resolveMilkrunColumnIndices(headerCells);
  if (!col) {
    throw new Error("밀크런 엑셀에서 필수 열(정산번호, 픽업일, 월 발생금액)을 찾지 못했습니다.");
  }
  const out: ParsedMilkrunRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = (matrix[r] as unknown[]).map((c) => String(c ?? "").trim());
    const needLen =
      Math.max(col.settle, col.pickup, col.monthly, col.totalInclTax, col.center, col.pallet) + 1;
    if (line.length < needLen) continue;
    const settleNo = line[col.settle] ?? "";
    if (!settleNo) continue;
    const deliveryDate = normalizeDateCell(line[col.pickup]);
    if (!deliveryDate) continue;
    const ym = yearMonthFromIsoDate(deliveryDate);
    const amount =
      (col.totalInclTax >= 0 ? parseNumberKo(line[col.totalInclTax]) : null) ??
      parseNumberKo(line[col.monthly]);
    if (amount == null) continue;
    const center = col.center >= 0 ? String(line[col.center] ?? "").trim() : "";
    const palletQty = col.pallet >= 0 ? String(line[col.pallet] ?? "").trim() : "";
    out.push({
      year_month: ym,
      amount,
      delivery_date: deliveryDate,
      description: buildDescription(center, palletQty),
      season: null,
      is_baseline: false,
    });
  }
  if (!out.length) throw new Error("유효한 밀크런 비용 행이 없습니다.");
  for (const row of out) {
    if ((!row.year_month || row.year_month.length < 7) && defaultYm) {
      row.year_month = defaultYm;
    }
  }
  return out;
}

/** 업로드 스킵 시 중복 판별 키 (DB와 동일 기준) */
export function milkrunDedupKey(
  r: Pick<ParsedMilkrunRow, "year_month" | "delivery_date" | "description">
): string {
  return `${r.year_month}|${r.delivery_date ?? ""}|${r.description ?? ""}`;
}

export async function parseMilkrunCosts(file: File): Promise<ParsedMilkrunRow[]> {
  const defaultYm = yearMonthFromMilkrunFileName(file.name);
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 120));
  const sniff = new TextDecoder("utf-8", { fatal: false }).decode(head).trimStart();

  if (sniff.startsWith("<") || sniff.startsWith("\ufeff<")) {
    const text = new TextDecoder("utf-8").decode(buf);
    return parseMilkrunHtmlDocument(text, defaultYm);
  }

  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  return parseMilkrunBinaryMatrix(matrix, defaultYm);
}
