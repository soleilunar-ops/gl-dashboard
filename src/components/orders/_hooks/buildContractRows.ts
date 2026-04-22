import type { PurchaseExcelParsedRow } from "@/lib/orders/purchaseExcel";
import {
  parseOrderSource,
  type OrderCompanyCode,
  type OrderSourceKind,
} from "@/lib/orders/orderMeta";
import type { Tables } from "@/lib/supabase/types";

/**
 * v_orders_dashboard 기반 계약 조회용 행 타입 (tx_type='purchase'만 사용).
 * 슬아 원안의 `ErpPurchaseWithProduct`(erp_purchases + products JOIN)를 대체.
 */
export type PurchaseDashboardRow = Pick<
  Tables<"v_orders_dashboard">,
  | "order_id"
  | "tx_date"
  | "item_id"
  | "item_name"
  | "item_name_raw"
  | "erp_code"
  | "erp_tx_no"
  | "erp_item_name_raw"
  | "counterparty"
  | "erp_system"
  | "quantity"
  | "unit_price"
  | "total_amount"
  | "supply_amount"
  | "vat"
  | "memo"
  | "status"
  | "tx_type"
>;

/** 입고 이행 상태 (반품 여부는 별도 플래그) */
export type FulfillmentStatus = "계약" | "진행중" | "완료";

export interface ContractTableRow {
  id: string;
  purchaseDate: string;
  erpCode: string;
  productName: string;
  unit: string;
  orderRef: string;
  quantity: number;
  unitPriceCny: number | null;
  totalCny: number | null;
  amountKrw: number | null;
  fulfillmentStatus: FulfillmentStatus;
  hasReturn: boolean;
  returnQty: number;
  approximate: boolean;
  /** item_master.item_id (bigint) — 슬아 원안의 productId(UUID)를 대체 */
  itemId: number | null;
  supplierName: string | null;
  companyCode: OrderCompanyCode;
  sourceKind: OrderSourceKind;
  supplyAmountCny: number | null;
  vatAmountCny: number | null;
  /** orders.status 원본 — pending/approved/rejected */
  status: string | null;
}

/**
 * 동일 품목 입고 수량을 발주일 순으로 소비해 이행 상태 산출.
 * v6 2단: stock_movement는 승인된 orders에서만 생성되므로,
 *   inboundByItem/returnByItem은 "실제 집행된" 수량을 반영함.
 */
export function buildContractRows(
  purchases: PurchaseDashboardRow[],
  inboundByItem: Record<number, number>,
  returnByItem: Record<number, number>,
  approximateByItem: Record<number, boolean>
): ContractTableRow[] {
  const byItem = new Map<number | null, PurchaseDashboardRow[]>();
  for (const p of purchases) {
    const key = p.item_id ?? null;
    const list = byItem.get(key) ?? [];
    list.push(p);
    byItem.set(key, list);
  }

  const result: ContractTableRow[] = [];

  for (const [, list] of byItem) {
    const sorted = [...list].sort((a, b) => {
      const at = a.tx_date ? new Date(a.tx_date).getTime() : 0;
      const bt = b.tx_date ? new Date(b.tx_date).getTime() : 0;
      return at - bt;
    });
    const itemId = sorted[0]?.item_id ?? null;
    let pool = itemId !== null ? (inboundByItem[itemId] ?? 0) : 0;
    const retQty = itemId !== null ? (returnByItem[itemId] ?? 0) : 0;
    const approx = itemId !== null ? Boolean(approximateByItem[itemId]) : false;

    for (const p of sorted) {
      if (p.order_id === null || p.order_id === undefined) continue;
      const qty = p.quantity ?? 0;
      let fulfillmentStatus: FulfillmentStatus;
      if (p.status === "approved") {
        fulfillmentStatus = "완료";
      } else if (pool >= qty) {
        fulfillmentStatus = "완료";
        pool -= qty;
      } else if (pool > 0) {
        fulfillmentStatus = "진행중";
        pool = 0;
      } else {
        fulfillmentStatus = "계약";
      }

      const sourceMeta = parseOrderSource(p.memo);
      result.push({
        id: String(p.order_id),
        purchaseDate: p.tx_date ?? "",
        erpCode: p.erp_code ?? "—",
        productName: p.item_name ?? p.erp_item_name_raw ?? "—",
        unit: "개",
        orderRef: p.erp_tx_no ?? String(p.order_id),
        quantity: qty,
        unitPriceCny:
          p.unit_price !== null && p.unit_price !== undefined ? Number(p.unit_price) : null,
        totalCny:
          p.total_amount !== null && p.total_amount !== undefined ? Number(p.total_amount) : null,
        amountKrw: null, // v6에서는 orders에 KRW 금액 별도 없음. 필요 시 환율 적용 후 계산
        fulfillmentStatus,
        hasReturn: retQty > 0,
        returnQty: retQty,
        approximate: approx,
        itemId,
        supplierName: p.counterparty,
        companyCode: sourceMeta.companyCode,
        sourceKind: sourceMeta.kind,
        supplyAmountCny:
          p.supply_amount !== null && p.supply_amount !== undefined
            ? Number(p.supply_amount)
            : null,
        vatAmountCny: p.vat !== null && p.vat !== undefined ? Number(p.vat) : null,
        status: p.status ?? null,
      });
    }
  }

  result.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
  return result;
}

/** 엑셀 미리보기 행 식별(선택 상태·동일건 비교용) */
export function excelPreviewRowKey(row: PurchaseExcelParsedRow): string {
  return `${row.erpRef}\t${row.erpCode}\t${row.purchaseDateIso}\t${row.quantity}\t${row.totalCny}`;
}

/** 엑셀 미리보기 → 송금 계산기용 ContractTableRow (DB 미반영 건) */
export function contractRowFromExcelPreview(row: PurchaseExcelParsedRow): ContractTableRow {
  const supplyAmount = Math.round((row.totalCny / 1.1) * 100) / 100;
  const vatAmount = Math.round((row.totalCny - supplyAmount) * 100) / 100;
  return {
    id: `excel-preview:${row.erpRef}:${row.erpCode}:${row.purchaseDateIso}:${row.quantity}`,
    purchaseDate: row.purchaseDateIso,
    erpCode: row.erpCode,
    productName: row.productName,
    unit: "개",
    orderRef: row.erpRef,
    quantity: row.quantity,
    unitPriceCny: row.unitPriceCny,
    totalCny: row.totalCny,
    amountKrw: null,
    fulfillmentStatus: "계약",
    hasReturn: false,
    returnQty: 0,
    approximate: false,
    itemId: null,
    supplierName: row.supplierName ? row.supplierName : null,
    companyCode: "glpharm",
    sourceKind: "excel_upload",
    supplyAmountCny: supplyAmount,
    vatAmountCny: vatAmount,
    status: null,
  };
}
