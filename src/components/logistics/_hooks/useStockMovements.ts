"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 신 스키마(HANDOVER v6) 매핑 메모
 * - 구 `transactions` → `orders`
 *   - id, item_id, tx_date 그대로
 *   - qty → quantity, note → memo
 *   - tx_type(IN_x / OUT_x) → purchase/sale/return_purchase/return_sale (양방향 매핑)
 *   - erp_synced: 신 스키마에 미존재 → 항상 1 (orders는 크롤러/CSV 적재만, 수동 입력 없음)
 * - 구 `inventory_snapshots` → `item_master.base_stock_qty + base_date`
 *   - HANDOVER v6 원칙: base_date(2026-04-08) 이전 거래는 stock_movement 트리거 skip → 재고 계산 제외
 *   - open_qty 계산은 base_stock_qty + 누적 변동(base_date < tx_date < from)
 */

const NEW_TO_OLD_TX_TYPE: Record<string, string> = {
  purchase: "IN_PURCHASE",
  return_sale: "IN_RETURN",
  production_in: "IN_PRODUCTION",
  sale: "OUT_SALE",
  return_purchase: "OUT_RETURN",
};

export type StockMovementSummary = {
  open_qty: number;
  total_in: number;
  total_out: number;
  close_qty: number;
};

export type StockMovementRow = {
  id: number;
  item_id: number;
  tx_date: string;
  tx_type: string;
  qty: number;
  counterparty: string | null;
  note: string | null;
  unit_price: number | null;
  erp_synced: number | null;
  running_balance: number;
};

type OrderRow = {
  id: number;
  item_id: number;
  tx_date: string;
  tx_type: string;
  quantity: number;
  counterparty: string | null;
  memo: string | null;
  unit_price: number | null;
  is_internal: boolean;
};

function signedQty(orderTxType: string, quantity: number): number {
  switch (orderTxType) {
    case "purchase":
    case "return_sale":
    case "production_in":
      return quantity;
    case "sale":
    case "return_purchase":
      return -quantity;
    default:
      return 0;
  }
}

function toOldTxType(newType: string): string {
  return NEW_TO_OLD_TX_TYPE[newType] ?? newType;
}

export function useStockMovements(
  itemId: number,
  from: string,
  to: string,
  // erpCode 파라미터는 구 스키마 호환용으로만 유지 (신 스키마는 base_stock_qty 사용)
  _erpCode?: string | null
) {
  const [summary, setSummary] = useState<StockMovementSummary>({
    open_qty: 0,
    total_in: 0,
    total_out: 0,
    close_qty: 0,
  });
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. 품목의 base_stock_qty + base_date (실사 기준)
    const { data: master, error: masterError } = await supabase
      .from("item_master")
      .select("base_stock_qty, base_date")
      .eq("item_id", itemId)
      .maybeSingle();

    if (masterError) {
      console.error("품목 마스터 조회 실패:", masterError.message);
      setError(masterError.message);
      setSummary({ open_qty: 0, total_in: 0, total_out: 0, close_qty: 0 });
      setRows([]);
      setLoading(false);
      return;
    }

    const baseQty = master?.base_stock_qty ?? 0;
    const baseDate = master?.base_date ?? null;

    // 2. 거래 내역 (외부 거래만 — is_internal=false. base_date 이후 거래만 재고 변동)
    //    UI 표시용으로 from~to 범위를 받지만, open_qty 계산을 위해 base_date+1 ~ to 범위로 조회
    const queryFrom = baseDate ? baseDate : "1970-01-01";

    const { data: orderRows, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, item_id, tx_date, tx_type, quantity, counterparty, memo, unit_price, is_internal"
      )
      .eq("item_id", itemId)
      .eq("is_internal", false)
      .gt("tx_date", queryFrom)
      .lte("tx_date", to)
      .order("tx_date", { ascending: true })
      .order("id", { ascending: true });

    if (orderError) {
      console.error("입출고 조회 실패:", orderError.message);
      setError(orderError.message);
      setSummary({ open_qty: 0, total_in: 0, total_out: 0, close_qty: 0 });
      setRows([]);
      setLoading(false);
      return;
    }

    const allOrders = (orderRows ?? []) as OrderRow[];

    // open_qty 계산: base_stock_qty + base_date+1 ~ from-1 사이 거래의 누적 변동
    let openQty = baseQty;
    for (const o of allOrders) {
      if (o.tx_date >= from) break;
      openQty += signedQty(o.tx_type, o.quantity);
    }

    // from ~ to 범위 거래에 대해 running_balance 계산
    const periodOrders = allOrders.filter((o) => o.tx_date >= from);

    let totalIn = 0;
    let totalOut = 0;
    let running = openQty;
    const withBalance: StockMovementRow[] = periodOrders.map((o) => {
      const delta = signedQty(o.tx_type, o.quantity);
      running += delta;
      if (delta > 0) totalIn += o.quantity;
      else if (delta < 0) totalOut += o.quantity;
      return {
        id: o.id,
        item_id: o.item_id,
        tx_date: o.tx_date,
        tx_type: toOldTxType(o.tx_type),
        qty: o.quantity,
        counterparty: o.counterparty,
        note: o.memo,
        unit_price: o.unit_price,
        erp_synced: 1,
        running_balance: running,
      };
    });

    const closeQty =
      withBalance.length > 0 ? withBalance[withBalance.length - 1].running_balance : openQty;

    setSummary({
      open_qty: openQty,
      total_in: totalIn,
      total_out: totalOut,
      close_qty: closeQty,
    });
    setRows(withBalance);
    setLoading(false);
  }, [supabase, itemId, from, to]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { summary, rows, loading, error, refetch: fetchData };
}
