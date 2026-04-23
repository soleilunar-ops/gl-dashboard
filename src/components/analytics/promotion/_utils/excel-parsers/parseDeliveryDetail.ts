/**
 * 납품 실적 Coupang_Stocked_Data_List*.xlsx → coupang_delivery_detail Insert 형태
 */
import * as XLSX from "xlsx";
import type { TablesInsert } from "@/lib/supabase/types";
import { normalizeDateCell, parseNumberKo } from "@/lib/excel-parsers/parsingUtils";

export type ParsedDeliveryRow = Omit<TablesInsert<"coupang_delivery_detail">, "id"> & {
  is_baseline: false;
};

const COL = {
  category: "구분",
  skuId: "SKU번호",
  skuName: "SKU명",
  inoutAt: "입고/반출시각",
  center: "물류센터",
  qty: "수량",
  unitPrice: "단가",
  supply: "공급가액",
  tax: "세액",
  invoiceNo: "계산서번호",
  payDate: "지급일",
} as const;

function mapHeader(cell: unknown): string {
  return String(cell ?? "").trim();
}

export async function parseDeliveryDetail(file: File): Promise<ParsedDeliveryRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("시트를 찾을 수 없습니다.");
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  if (!matrix.length) throw new Error("빈 시트입니다.");

  const headerRow = matrix[0]!.map(mapHeader);
  const colIndex: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    if (h) colIndex[h] = i;
  });

  const need = [COL.inoutAt, COL.skuId, COL.invoiceNo];
  for (const k of need) {
    if (colIndex[k] === undefined) {
      throw new Error(`필수 열을 찾을 수 없습니다: ${k}`);
    }
  }

  const out: ParsedDeliveryRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] as unknown[];
    if (!line || !line.length) continue;
    const get = (name: string) => {
      const idx = colIndex[name];
      return idx === undefined ? "" : line[idx];
    };

    const inoutRaw = get(COL.inoutAt);
    const deliveryDate = normalizeDateCell(inoutRaw);
    if (!deliveryDate) continue;

    const skuId = String(get(COL.skuId) ?? "").trim();
    const invoiceRaw = String(get(COL.invoiceNo) ?? "").trim();
    if (!skuId && !invoiceRaw) continue;
    const cat = String(get(COL.category) ?? "").trim();
    if (cat && /^(합계|소계)/.test(cat)) continue;

    const payRaw = get(COL.payDate);
    const paymentDate = normalizeDateCell(payRaw);

    out.push({
      delivery_date: deliveryDate,
      sku_id: skuId || null,
      sku_name: String(get(COL.skuName) ?? "").trim() || null,
      logistics_center: String(get(COL.center) ?? "").trim() || null,
      quantity: parseNumberKo(get(COL.qty)),
      unit_price: parseNumberKo(get(COL.unitPrice)),
      supply_amount: parseNumberKo(get(COL.supply)),
      tax_amount: parseNumberKo(get(COL.tax)),
      total_supply_amount: parseNumberKo(get("총공급가액")),
      invoice_no: invoiceRaw || null,
      payment_date: paymentDate,
      season: null,
      is_baseline: false,
    });
  }

  if (!out.length) throw new Error("유효한 납품 데이터 행이 없습니다.");
  return out;
}
