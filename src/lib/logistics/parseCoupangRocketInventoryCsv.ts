import Papa from "papaparse";

/** 쿠팡 판매자센터 로켓 일별 재고 CSV 한 행(파싱 결과) */
export type ParsedRocketInventoryRow = {
  op_date: string;
  sku_id: string;
  center: string;
  sku_name: string;
  brand: string | null;
  product_category: string | null;
  sub_category: string | null;
  detail_category: string | null;
  barcode: string | null;
  order_status: string | null;
  order_status_detail: string | null;
  inbound_qty: number;
  outbound_qty: number;
  current_stock: number;
  purchase_cost: number;
  order_fulfillment_rate: number | null;
  confirmed_fulfillment_rate: number | null;
  return_rate: number | null;
  return_reason: string | null;
  is_stockout: boolean;
  category_stockout_rate: number | null;
};

export type ParseRocketCsvResult = {
  rows: ParsedRocketInventoryRow[];
  errors: string[];
  skippedEmptySku: number;
};

function trimCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .trim()
    .replace(/^["']|["']$/g, "");
}

/** 쿠팡 다운로드는 탭(TSV)인 경우가 많고, 일부는 쉼표(CSV)다. 첫 줄로 구분자를 고른다. */
function detectDelimiter(firstLine: string): string {
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs > commas) return "\t";
  return ",";
}

/** 첫 줄에 쿠팡 일별 재고 헤더(ASCII `SKU ID` + 한글 날짜/일자)가 보이면 true */
function headerLooksLikeRocketInventory(firstLine: string): boolean {
  if (!firstLine.includes("SKU ID")) return false;
  return firstLine.includes("날짜") || firstLine.includes("일자");
}

/**
 * 판매자센터에서 받은 파일은 UTF-8·UTF-16·CP949(윈도우 엑셀 ANSI)가 섞여 있다.
 * 업로드 바이트를 적절히 UTF-16/UTF-8 BOM 처리 후, 헤더 검증으로 CP949 폴백한다.
 */
export function decodeCoupangInventoryFileBytes(data: Uint8Array): string {
  if (data.length === 0) return "";

  // UTF-16 LE BOM
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(data);
  }
  // UTF-16 BE BOM
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(data);
  }

  let body = data;
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    body = data.subarray(3);
  }

  const asUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const firstUtf8 = asUtf8.split(/\r?\n/, 1)[0] ?? "";
  if (headerLooksLikeRocketInventory(firstUtf8)) {
    return asUtf8;
  }

  const asCp949 = new TextDecoder("windows-949", { fatal: false }).decode(data);
  const firstCp = asCp949.split(/\r?\n/, 1)[0] ?? "";
  if (headerLooksLikeRocketInventory(firstCp)) {
    return asCp949;
  }

  return asUtf8;
}

function parseYmdToIso(raw: string): string | null {
  const s = raw.replace(/\D/g, "");
  if (s.length !== 8) return null;
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  const mi = Number(m);
  const di = Number(d);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return `${y}-${m}-${d}`;
}

function parseIntSafe(raw: string, fallback = 0): number {
  const n = Number.parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatNullable(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cell(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (k in rec && rec[k] !== undefined && rec[k] !== null) {
      return trimCell(rec[k]);
    }
  }
  return "";
}

/**
 * 쿠팡 로켓 일별 재고 CSV 텍스트를 파싱한다.
 * 헤더는 판매자센터 기본 다운로드(한글 컬럼명)를 가정하며, 공백/BOM만 정규화한다.
 */
export function parseCoupangRocketInventoryCsv(fileText: string): ParseRocketCsvResult {
  const errors: string[] = [];
  let skippedEmptySku = 0;

  const bomStripped = fileText.charCodeAt(0) === 0xfeff ? fileText.slice(1) : fileText;
  const firstLineBreak = bomStripped.search(/\r?\n/);
  const headerLine = firstLineBreak === -1 ? bomStripped : bomStripped.slice(0, firstLineBreak);
  const delimiter = detectDelimiter(headerLine);

  const parsed = Papa.parse<Record<string, unknown>>(bomStripped, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter,
    transformHeader: (h) =>
      String(h)
        .replace(/^\uFEFF/, "")
        .trim(),
  });

  if (parsed.errors.length > 0) {
    for (const e of parsed.errors) {
      if (e.message) errors.push(`CSV: ${e.message}`);
    }
  }

  const fields =
    parsed.meta.fields?.map((f) =>
      String(f)
        .replace(/^\uFEFF/, "")
        .trim()
    ) ?? [];
  const hasField = (name: string) => fields.includes(name);
  if (!hasField("날짜") || !hasField("SKU ID")) {
    errors.push(
      "필수 컬럼이 없습니다. 판매자센터에서 받은 일별 재고 파일(탭 또는 쉼표 구분)인지, 헤더에 「날짜」「SKU ID」가 있는지 확인하세요."
    );
    return { rows: [], errors, skippedEmptySku: 0 };
  }

  const data = parsed.data ?? [];
  if (data.length === 0) {
    errors.push("데이터 행이 없습니다.");
    return { rows: [], errors, skippedEmptySku: 0 };
  }

  const rows: ParsedRocketInventoryRow[] = [];
  const lineBase = 2;

  for (let i = 0; i < data.length; i += 1) {
    const rec = data[i] as Record<string, unknown>;
    const line = i + lineBase;

    const dateRaw = cell(rec, "날짜");
    const skuId = cell(rec, "SKU ID");
    const centerRaw = cell(rec, "센터");

    if (!dateRaw && !skuId && !centerRaw) {
      skippedEmptySku += 1;
      continue;
    }

    if (!skuId) {
      skippedEmptySku += 1;
      continue;
    }

    const opDate = parseYmdToIso(dateRaw);
    if (!opDate) {
      errors.push(`${line}행: 날짜 형식 오류 (${dateRaw || "빈값"})`);
      continue;
    }

    const center = centerRaw.trim() ? centerRaw.trim() : "-";
    const stockoutRaw = cell(rec, "품절여부").toUpperCase();

    rows.push({
      op_date: opDate,
      sku_id: skuId,
      center,
      sku_name: cell(rec, "SKU 명") || skuId,
      brand: cell(rec, "브랜드") || null,
      product_category: cell(rec, "상품 카테고리") || null,
      sub_category: cell(rec, "하위 카테고리") || null,
      detail_category: cell(rec, "세부 카테고리") || null,
      barcode: cell(rec, "바코드") || null,
      order_status: cell(rec, "발주가능상태") || null,
      order_status_detail: cell(rec, "발주가능상태_세부") || null,
      inbound_qty: parseIntSafe(cell(rec, "입고수량"), 0),
      outbound_qty: parseIntSafe(cell(rec, "출고수량"), 0),
      current_stock: parseIntSafe(cell(rec, "현재재고수량"), 0),
      purchase_cost: parseIntSafe(cell(rec, "매입원가"), 0),
      order_fulfillment_rate: parseFloatNullable(cell(rec, "발주대비 납품율")),
      confirmed_fulfillment_rate: parseFloatNullable(cell(rec, "확정대비 납품율")),
      return_rate: parseFloatNullable(cell(rec, "회송율")),
      return_reason: cell(rec, "회송사유") || null,
      is_stockout: stockoutRaw === "YES" || stockoutRaw === "Y" || stockoutRaw === "TRUE",
      category_stockout_rate: parseFloatNullable(cell(rec, "세부카테고리 품절율")),
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("유효한 데이터 행이 없습니다.");
  }

  return { rows, errors, skippedEmptySku };
}
