"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** stock_movement 원장 기반 재고 수불 훅 */

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

type MovementRow = {
  id: number;
  movement_date: string;
  movement_type: string;
  quantity_delta: number;
  real_quantity?: number | null;
  source_table: string;
  source_id: number | null;
  memo: string | null;
};

function signedQty(quantityDelta: number): number {
  return quantityDelta;
}

function toLedgerTxType(movementType: string, quantityDelta: number): string {
  if (quantityDelta >= 0) {
    if (movementType === "return_sale") return "IN_RETURN";
    if (movementType === "adjust") return "IN_ADJUST";
    return "IN_PURCHASE";
  }

  if (movementType === "return_purchase") return "OUT_RETURN";
  if (movementType === "adjust") return "OUT_ADJUST";
  return "OUT_SALE";
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

    // 2. stock_movement 원장 조회 (승인 반영된 실제 재고 변동)
    const queryFrom = baseDate ? baseDate : "1970-01-01";

    // real_quantity 컬럼이 있는 환경을 우선 시도하고, 없으면 기존 컬럼으로 폴백
    const movementWithRealQuery = await supabase
      .from("stock_movement")
      .select(
        "id, movement_date, movement_type, quantity_delta, real_quantity, source_table, source_id, memo"
      )
      .eq("item_id", itemId)
      .gt("movement_date", queryFrom)
      .lte("movement_date", to)
      .order("movement_date", { ascending: true })
      .order("id", { ascending: true });

    let movementRows = movementWithRealQuery.data;
    let movementError = movementWithRealQuery.error;

    if (movementError) {
      const movementFallbackQuery = await supabase
        .from("stock_movement")
        .select("id, movement_date, movement_type, quantity_delta, source_table, source_id, memo")
        .eq("item_id", itemId)
        .gt("movement_date", queryFrom)
        .lte("movement_date", to)
        .order("movement_date", { ascending: true })
        .order("id", { ascending: true });
      movementRows = movementFallbackQuery.data;
      movementError = movementFallbackQuery.error;
    }

    if (movementError) {
      console.error("입출고 조회 실패:", movementError.message);
      setError(movementError.message);
      setSummary({ open_qty: 0, total_in: 0, total_out: 0, close_qty: 0 });
      setRows([]);
      setLoading(false);
      return;
    }

    const allMovements = (movementRows ?? []) as MovementRow[];

    const resolveSignedDelta = (movement: MovementRow): number => {
      const hasRealQuantity =
        typeof movement.real_quantity === "number" && Number.isFinite(movement.real_quantity);
      const baseQty = hasRealQuantity
        ? Math.abs(movement.real_quantity as number)
        : Math.abs(movement.quantity_delta);

      // 요청 규칙: sale는 차감(-), purchase는 가산(+)
      if (movement.movement_type === "sale") return -baseQty;
      if (movement.movement_type === "purchase") return baseQty;

      // 그 외 유형은 기존 delta 부호를 유지
      const sign = movement.quantity_delta >= 0 ? 1 : -1;
      return sign * baseQty;
    };

    // open_qty 계산: base_stock_qty + base_date+1 ~ from-1 사이 누적 변동
    let openQty = baseQty;
    for (const movement of allMovements) {
      if (movement.movement_date >= from) break;
      openQty += signedQty(resolveSignedDelta(movement));
    }

    // from ~ to 범위 변동에 대해 running_balance 계산
    const periodMovements = allMovements.filter((movement) => movement.movement_date >= from);

    let totalIn = 0;
    let totalOut = 0;
    let running = openQty;
    const withBalance: StockMovementRow[] = periodMovements.map((movement) => {
      const delta = signedQty(resolveSignedDelta(movement));
      const absQty = Math.abs(delta);
      running += delta;
      if (delta > 0) totalIn += absQty;
      else if (delta < 0) totalOut += absQty;

      return {
        id: movement.id,
        item_id: itemId,
        tx_date: movement.movement_date,
        tx_type: toLedgerTxType(movement.movement_type, delta),
        qty: absQty,
        counterparty: null,
        note: movement.memo,
        unit_price: null,
        erp_synced: movement.source_table === "orders" && movement.source_id !== null ? 1 : 0,
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
