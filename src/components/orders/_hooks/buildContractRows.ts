import type { PurchaseExcelParsedRow } from "@/lib/orders/purchaseExcel";
import {
  parseOrderSource,
  type OrderCompanyCode,
  type OrderSourceKind,
} from "@/lib/orders/orderMeta";
import type { ErpPurchaseWithProduct } from "./useErpPurchases";

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
  productId: string | null;
  supplierName: string | null;
  companyCode: OrderCompanyCode;
  sourceKind: OrderSourceKind;
  supplyAmountCny: number | null;
  vatAmountCny: number | null;
}

/** 동일 품목 입고 수량을 발주일 순으로 소비해 이행 상태 산출 */
export function buildContractRows(
  purchases: ErpPurchaseWithProduct[],
  inboundByProduct: Record<string, number>,
  returnByProduct: Record<string, number>,
  approximateByProduct: Record<string, boolean>
): ContractTableRow[] {
  const byProduct = new Map<string | null, ErpPurchaseWithProduct[]>();
  for (const p of purchases) {
    const key = p.product_id;
    const list = byProduct.get(key) ?? [];
    list.push(p);
    byProduct.set(key, list);
  }

  const result: ContractTableRow[] = [];

  for (const [, list] of byProduct) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime()
    );
    const pid = sorted[0]?.product_id ?? null;
    let pool = pid ? (inboundByProduct[pid] ?? 0) : 0;
    const retQty = pid ? (returnByProduct[pid] ?? 0) : 0;
    const approx = pid ? Boolean(approximateByProduct[pid]) : false;

    for (const p of sorted) {
      if (!p.id) {
        continue;
      }
      const qty = p.quantity ?? 0;
      let fulfillmentStatus: FulfillmentStatus;
      if (pool >= qty) {
        fulfillmentStatus = "완료";
        pool -= qty;
      } else if (pool > 0) {
        fulfillmentStatus = "진행중";
        pool = 0;
      } else {
        fulfillmentStatus = "계약";
      }

      const sourceMeta = parseOrderSource(p.source);
      result.push({
        id: p.id,
        purchaseDate: p.purchase_date,
        erpCode: p.products?.erp_code ?? p.erp_code ?? "—",
        productName: p.products?.name ?? p.erp_product_name ?? "—",
        unit: p.products?.unit ?? "개",
        orderRef: p.erp_ref ?? p.id.slice(0, 8).toUpperCase(),
        quantity: qty,
        unitPriceCny:
          p.unit_price !== null && p.unit_price !== undefined ? Number(p.unit_price) : null,
        totalCny:
          p.unit_price !== null && p.unit_price !== undefined ? qty * Number(p.unit_price) : null,
        amountKrw: p.amount !== null && p.amount !== undefined ? Number(p.amount) : null,
        fulfillmentStatus,
        hasReturn: retQty > 0,
        returnQty: retQty,
        approximate: approx,
        productId: pid,
        supplierName: p.supplier_name,
        companyCode: sourceMeta.companyCode,
        sourceKind: sourceMeta.kind,
        supplyAmountCny:
          p.unit_price !== null && p.unit_price !== undefined
            ? Math.round(((qty * Number(p.unit_price)) / 1.1) * 100) / 100
            : null,
        vatAmountCny:
          p.unit_price !== null && p.unit_price !== undefined
            ? Math.round((qty * Number(p.unit_price) - (qty * Number(p.unit_price)) / 1.1) * 100) /
              100
            : null,
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
    productId: null,
    supplierName: row.supplierName ? row.supplierName : null,
    companyCode: "glpharm",
    sourceKind: "excel_upload",
    supplyAmountCny: supplyAmount,
    vatAmountCny: vatAmount,
  };
}
