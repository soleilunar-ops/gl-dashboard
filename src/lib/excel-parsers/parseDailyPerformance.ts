/**
 * 쿠팡 일별 판매 실적 CSV (daily_performance_*.csv) → coupang_daily_performance Insert 형태
 */
import Papa from "papaparse";
import type { InsertTables } from "@/lib/supabase/types";
import { isSummaryRowLabel, parseNumberKo, yyyymmddToIso } from "./parsingUtils";

export type ParsedDailyPerformanceRow = InsertTables<"coupang_daily_performance"> & {
  is_baseline: false;
};

const COL = {
  date: "날짜",
  skuId: "SKU ID",
  skuName: "SKU 명",
  brand: "브랜드",
  gmv: "매출액(GMV)",
  unitsSold: "판매수량(Units Sold)",
  returnUnits: "반품수량(Return Units)",
  cogs: "매입원가(COGS)",
  asp: "평균판매금액(ASP)",
  couponDiscount: "쿠폰 할인가(쿠팡 추가 할인가 제외)",
  instantDiscount: "즉시 할인가",
  promoGmv: "프로모션발생매출액(GMV)",
  promoUnits: "프로모션발생판매수량(Units Sold)",
  orderCount: "주문건수",
  conversionRate: "구매전환율",
  pageViews: "PV",
  vendorItemId: "벤더아이템 ID",
} as const;

function pick(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

export async function parseDailyPerformance(file: File): Promise<ParsedDailyPerformanceRow[]> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    const msg = parsed.errors.map((e) => e.message).join("; ");
    throw new Error(`CSV 파싱 오류: ${msg}`);
  }
  const rows = parsed.data ?? [];
  if (!rows.length) throw new Error("파일에 데이터 행이 없습니다.");

  const first = rows[0] as Record<string, unknown>;
  if (!first[COL.date] || !first[COL.skuId]) {
    throw new Error(
      "필수 열(날짜, SKU ID)을 찾을 수 없습니다. 쿠팡 일별 판매 실적 CSV인지 확인해 주세요."
    );
  }

  const out: ParsedDailyPerformanceRow[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const dateRaw = pick(row, COL.date);
    const dateIso =
      yyyymmddToIso(dateRaw) ??
      (typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateRaw)
        ? dateRaw.slice(0, 10)
        : null);
    const skuId = String(pick(row, COL.skuId) ?? "").trim();
    if (!dateIso || !skuId) continue;
    const skuNameRaw = pick(row, COL.skuName);
    if (typeof skuNameRaw === "string" && isSummaryRowLabel(skuNameRaw)) continue;

    const vendorItemId = String(pick(row, COL.vendorItemId) ?? "").trim() || null;

    out.push({
      date: dateIso,
      sku_id: skuId,
      sku_name: String(pick(row, COL.skuName) ?? "").trim() || null,
      brand: String(pick(row, COL.brand) ?? "").trim() || null,
      gmv: parseNumberKo(pick(row, COL.gmv)),
      units_sold: parseNumberKo(pick(row, COL.unitsSold)),
      return_units: parseNumberKo(pick(row, COL.returnUnits)),
      cogs: parseNumberKo(pick(row, COL.cogs)),
      asp: parseNumberKo(pick(row, COL.asp)),
      coupon_discount: parseNumberKo(pick(row, COL.couponDiscount)),
      instant_discount: parseNumberKo(pick(row, COL.instantDiscount)),
      promo_gmv: parseNumberKo(pick(row, COL.promoGmv)),
      promo_units_sold: parseNumberKo(pick(row, COL.promoUnits)),
      order_count: parseNumberKo(pick(row, COL.orderCount)),
      conversion_rate: parseNumberKo(pick(row, COL.conversionRate)),
      page_views: parseNumberKo(pick(row, COL.pageViews)),
      vendor_item_id: vendorItemId,
      season: null,
      is_baseline: false,
    });
  }
  if (!out.length) throw new Error("유효한 데이터 행이 없습니다.");
  return out;
}
