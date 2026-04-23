/**
 * ERP 엑셀 원천 테이블 → 주문 대시보드 행 변환
 * 변경 이유: 브라우저 anon 클라이언트는 RLS로 0건만 올 수 있어 서버(service_role) 조회와 로직 공유
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { OrderDashboardRow } from "@/components/orders/_hooks/useOrders";
import { normalizeOrderCompanyCode, type OrderCompanyCode } from "@/lib/orders/orderMeta";

export type RawEcountRow = Record<string, unknown>;

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asCodeString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  return null;
}

/** 원천 컬럼명 차이 대응 — 변경 이유: 기업/메뉴별 품목코드 컬럼명 불일치로 erp_code 누락 방지 */
function resolveErpCode(r: RawEcountRow): string | null {
  const candidates: unknown[] = [
    r.erp_code,
    r.item_code,
    r.product_code,
    r.goods_code,
    r.code,
    r.item_cd,
    r.product_cd,
  ];
  for (const c of candidates) {
    const code = asCodeString(c);
    if (code) return code;
  }
  return null;
}

/** 판매 원천 memo 반품 판별 — 변경 이유: 반품 필터를 sales 테이블 memo 포함 기준으로 정확히 분리 */
function isReturnMemo(v: unknown): boolean {
  const memo = asString(v);
  if (!memo) return false;
  return memo.includes("반품");
}

function makeDashboardBase(orderId: number): OrderDashboardRow {
  return {
    approved_at: null,
    approved_by: null,
    category: null,
    counterparty: null,
    crawled_at: null,
    created_at: null,
    erp_code: null,
    erp_item_name_raw: null,
    erp_system: null,
    erp_tx_no: null,
    is_internal: null,
    is_return: null,
    item_id: null,
    item_name: null,
    item_name_raw: null,
    item_type: null,
    memo: null,
    order_id: orderId,
    quantity: null,
    quantity_delta: null,
    rejected_reason: null,
    seq_no: null,
    status: "pending",
    status_label: "승인대기",
    stock_after_this_tx: null,
    stock_direction: null,
    stock_movement_id: null,
    supply_amount: null,
    total_amount: null,
    tx_category: null,
    tx_category_label: null,
    tx_date: null,
    tx_type: null,
    tx_type_label: null,
    unit_price: null,
    vat: null,
  };
}

/** 기업별 엑셀 적재 원천 테이블 */
export const COMPANY_ERP_SOURCE_TABLES: Record<
  OrderCompanyCode,
  { purchase: string; sales: string; production: string | null }
> = {
  gl: {
    purchase: "ecount_purchase_excel",
    sales: "ecount_sales_excel",
    production: "ecount_production_receipt",
  },
  glpharm: {
    purchase: "ecount_glpharm_purchase_excel",
    sales: "ecount_glpharm_sales_excel",
    production: null,
  },
  hnb: {
    purchase: "ecount_hnb_purchase_excel",
    sales: "ecount_hnb_sales_excel",
    production: null,
  },
};

export const ALL_ORDER_COMPANY_CODES: OrderCompanyCode[] = ["gl", "glpharm", "hnb"];

async function fetchTableRowsSafe(
  supabase: SupabaseClient<Database>,
  tableName: string,
  dateColumn: string,
  dateFrom: string,
  dateTo: string
): Promise<RawEcountRow[]> {
  const { data, error: qErr } = await supabase
    .from(tableName as never)
    .select("*")
    .order(dateColumn as never, { ascending: false })
    .limit(5000)
    .gte(dateColumn as never, dateFrom)
    .lte(dateColumn as never, dateTo);

  if (qErr) {
    const msg = (qErr.message ?? "").toLowerCase();
    const isMissing =
      msg.includes("does not exist") ||
      msg.includes("not found") ||
      msg.includes("relation") ||
      msg.includes("schema cache");
    if (isMissing) {
      console.warn(`[ecountExcelSource] 테이블 조회 생략: ${tableName}`, qErr.message);
      return [];
    }
    throw new Error(`${tableName} 조회 실패: ${qErr.message}`);
  }
  return (data ?? []) as RawEcountRow[];
}

function mapPurchaseSourceRow(
  r: RawEcountRow,
  companyCode: OrderCompanyCode,
  orderId: number
): OrderDashboardRow {
  const row = makeDashboardBase(orderId);
  // 기업코드 강제 정규화 — 변경 이유: 원천 company_code 포맷 차이(glpharm 등)로 목록 필터 누락 방지
  row.erp_system = normalizeOrderCompanyCode(companyCode);
  row.tx_type = "purchase";
  row.tx_type_label = "구매";
  row.tx_date = asString(r.doc_date);
  row.erp_tx_no = asString(r.doc_no);
  row.erp_code = resolveErpCode(r);
  row.item_name = asString(r.product_name);
  row.erp_item_name_raw = asString(r.product_name);
  row.quantity = asNumber(r.qty);
  row.unit_price = asNumber(r.unit_price);
  row.supply_amount = asNumber(r.supply_amount);
  row.vat = asNumber(r.vat_amount);
  row.total_amount = asNumber(r.total_amount);
  row.counterparty = asString(r.counterparty);
  row.memo = asString(r.memo);
  row.crawled_at = asString(r.crawled_at);
  return row;
}

function mapSalesSourceRow(
  r: RawEcountRow,
  companyCode: OrderCompanyCode,
  orderId: number
): OrderDashboardRow {
  const row = makeDashboardBase(orderId);
  const memo = asString(r.memo);
  const isReturn = isReturnMemo(memo);
  // 기업코드 강제 정규화 — 변경 이유: 원천 company_code 포맷 차이(glpharm 등)로 목록 필터 누락 방지
  row.erp_system = normalizeOrderCompanyCode(companyCode);
  row.tx_type = isReturn ? "return_sale" : "sale";
  row.tx_type_label = isReturn ? "반품" : "판매";
  row.is_return = isReturn;
  row.tx_date = asString(r.doc_date);
  row.erp_tx_no = asString(r.doc_no);
  row.erp_code = resolveErpCode(r);
  row.item_name = asString(r.product_name);
  row.erp_item_name_raw = asString(r.product_name);
  row.quantity = asNumber(r.qty);
  row.unit_price = asNumber(r.unit_price);
  row.supply_amount = asNumber(r.supply_amount);
  row.vat = asNumber(r.vat_amount);
  row.total_amount = asNumber(r.total_amount);
  row.counterparty = asString(r.counterparty);
  row.memo = memo;
  row.crawled_at = asString(r.crawled_at);
  return row;
}

function mapProductionSourceRow(
  r: RawEcountRow,
  companyCode: OrderCompanyCode,
  orderId: number
): OrderDashboardRow {
  const row = makeDashboardBase(orderId);
  // 기업코드 강제 정규화 — 변경 이유: 원천 company_code 포맷 차이(glpharm 등)로 목록 필터 누락 방지
  row.erp_system = normalizeOrderCompanyCode(companyCode);
  row.tx_type = "production_in";
  row.tx_type_label = "생산";
  row.tx_date = asString(r.date_from);
  row.erp_tx_no =
    asString(r.receipt_no) ?? asString(r.work_order) ?? `production-receipt-${String(r.id ?? "")}`;
  row.erp_code = null;
  row.item_name = asString(r.product_name);
  row.erp_item_name_raw = asString(r.product_name);
  row.quantity = asNumber(r.qty);
  row.unit_price = null;
  row.supply_amount = null;
  row.vat = null;
  row.total_amount = null;
  row.counterparty = asString(r.factory_name) ?? asString(r.warehouse_name);
  row.memo = null;
  row.crawled_at = asString(r.crawled_at);
  return row;
}

type Batch = {
  kind: "purchase" | "sale" | "production_in";
  company: OrderCompanyCode;
  rows: RawEcountRow[];
};

/**
 * Supabase 클라이언트(서버 service_role 권장)로 엑셀 원천 테이블을 읽어 대시보드 행으로 합침
 */
export async function fetchEcountExcelDashboardRows(
  supabase: SupabaseClient<Database>,
  selectedCompanyCodes: OrderCompanyCode[],
  options?: { dateFrom?: string; dateTo?: string }
): Promise<OrderDashboardRow[]> {
  const today = options?.dateTo ?? new Date().toISOString().slice(0, 10);
  const fromDate = options?.dateFrom ?? "2000-01-01";
  const companies: OrderCompanyCode[] =
    selectedCompanyCodes.length === 0 ? [...ALL_ORDER_COMPANY_CODES] : [...selectedCompanyCodes];

  const jobs: Promise<Batch>[] = [];
  for (const co of companies) {
    const tables = COMPANY_ERP_SOURCE_TABLES[co];
    jobs.push(
      fetchTableRowsSafe(supabase, tables.purchase, "doc_date", fromDate, today).then((rows) => ({
        kind: "purchase" as const,
        company: co,
        rows,
      }))
    );
    jobs.push(
      fetchTableRowsSafe(supabase, tables.sales, "doc_date", fromDate, today).then((rows) => ({
        kind: "sale" as const,
        company: co,
        rows,
      }))
    );
    if (tables.production) {
      jobs.push(
        fetchTableRowsSafe(supabase, tables.production, "date_from", fromDate, today).then(
          (rows) => ({
            kind: "production_in" as const,
            company: co,
            rows,
          })
        )
      );
    }
  }

  const batches = await Promise.all(jobs);
  let syntheticOrderId = -1;
  const mapped: OrderDashboardRow[] = [];

  for (const batch of batches) {
    if (batch.kind === "purchase") {
      for (const r of batch.rows) {
        mapped.push(mapPurchaseSourceRow(r, batch.company, syntheticOrderId--));
      }
    } else if (batch.kind === "sale") {
      for (const r of batch.rows) {
        mapped.push(mapSalesSourceRow(r, batch.company, syntheticOrderId--));
      }
    } else {
      for (const r of batch.rows) {
        mapped.push(mapProductionSourceRow(r, batch.company, syntheticOrderId--));
      }
    }
  }

  mapped.sort((a, b) => {
    const da = a.tx_date ?? "";
    const db = b.tx_date ?? "";
    if (da !== db) return db.localeCompare(da);
    const oa = a.order_id ?? 0;
    const ob = b.order_id ?? 0;
    return ob - oa;
  });

  return mapped;
}
