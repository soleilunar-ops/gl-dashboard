"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { openingStockByErpCode } from "../_data/openingStockByErpCode";

/** PM이 supabase/types에 반영하기 전까지 훅에서 사용하는 물류 테이블 Row */
type LogisticsItemRow = {
  id: number;
  seq_no: number;
  item_name: string;
  manufacture_year: string | null;
  production_type: string | null;
  erp_code: string | null;
  coupang_sku_id: string | null;
  cost_price: number | null;
  is_active: boolean;
};

type InventorySnapshotRow = {
  id: number;
  item_id: number;
  physical_qty: number;
  erp_qty: number | null;
  snapshot_at: string;
};

type LogisticsTransactionRow = {
  id: number;
  item_id: number;
  tx_date: string;
  tx_type: string;
  qty: number;
};

type ScheduledTransactionRow = {
  id: number;
  item_id: number;
  scheduled_date: string;
  tx_type: string;
  qty: number;
  status: string;
  counterparty?: string | null;
  note?: string | null;
};

type LogisticsDatabase = {
  public: {
    Tables: Database["public"]["Tables"] & {
      items: {
        Row: LogisticsItemRow;
        Insert: Omit<LogisticsItemRow, "id"> & { id?: number };
        Update: Partial<LogisticsItemRow>;
      };
      inventory_snapshots: {
        Row: InventorySnapshotRow;
        Insert: Omit<InventorySnapshotRow, "id"> & { id?: number };
        Update: Partial<InventorySnapshotRow>;
      };
      transactions: {
        Row: LogisticsTransactionRow;
        Insert: Omit<LogisticsTransactionRow, "id"> & { id?: number };
        Update: Partial<LogisticsTransactionRow>;
      };
      scheduled_transactions: {
        Row: ScheduledTransactionRow;
        Insert: Omit<ScheduledTransactionRow, "id"> & { id?: number };
        Update: Partial<ScheduledTransactionRow>;
      };
    };
    Views: Database["public"]["Views"];
    Functions: Database["public"]["Functions"];
  };
};

export type InventoryItem = LogisticsItemRow & {
  current_qty: number;
  erp_qty: number | null;
  diff: number | null;
  stock_amount: number;
  in_7days: number;
  out_7days: number;
};

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function isInboundType(txType: string): boolean {
  return txType.startsWith("IN_");
}

function isOutboundType(txType: string): boolean {
  return txType.startsWith("OUT_");
}

/** 스냅샷 시점 이후 거래에 대한 수량 변화 (입고 +, 출고 -) */
function signedDeltaAfterSnapshot(
  tx: LogisticsTransactionRow,
  snapshotDateStr: string | null
): number {
  if (snapshotDateStr !== null && tx.tx_date <= snapshotDateStr) {
    return 0;
  }
  if (isInboundType(tx.tx_type)) return tx.qty;
  if (isOutboundType(tx.tx_type)) return -tx.qty;
  return 0;
}

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(
    () => createClient() as unknown as SupabaseClient<LogisticsDatabase>,
    []
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: itemRows, error: itemsError } = await supabase
      .from("items")
      .select("*")
      .eq("is_active", true)
      .order("seq_no", { ascending: true });

    if (itemsError) {
      console.error("품목 조회 실패:", itemsError.message);
      setError(itemsError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const list = (itemRows ?? []) as LogisticsItemRow[];
    if (list.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const itemIds = list.map((r) => r.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatLocalYmd(today);
    const weekEndStr = formatLocalYmd(addCalendarDays(today, 7));

    const [
      { data: snapRows, error: snapError },
      { data: txRows, error: txError },
      { data: schedRows, error: schedError },
    ] = await Promise.all([
      supabase.from("inventory_snapshots").select("*").in("item_id", itemIds),
      supabase.from("transactions").select("*").in("item_id", itemIds),
      supabase
        .from("scheduled_transactions")
        .select("*")
        .in("item_id", itemIds)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_date", todayStr)
        .lte("scheduled_date", weekEndStr),
    ]);

    if (snapError) {
      console.error("스냅샷 조회 실패:", snapError.message);
      setError(snapError.message);
      setItems([]);
      setLoading(false);
      return;
    }
    if (txError) {
      console.error("입출고 조회 실패:", txError.message);
      setError(txError.message);
      setItems([]);
      setLoading(false);
      return;
    }
    if (schedError) {
      console.error("예정 입출고 조회 실패:", schedError.message);
      setError(schedError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const snaps = (snapRows ?? []) as InventorySnapshotRow[];
    const txs = (txRows ?? []) as LogisticsTransactionRow[];
    const sched = (schedRows ?? []) as ScheduledTransactionRow[];

    const latestSnapByItem = new Map<number, InventorySnapshotRow>();
    for (const s of snaps) {
      const cur = latestSnapByItem.get(s.item_id);
      if (!cur || s.snapshot_at > cur.snapshot_at) {
        latestSnapByItem.set(s.item_id, s);
      }
    }

    const txsByItem = new Map<number, LogisticsTransactionRow[]>();
    for (const t of txs) {
      const arr = txsByItem.get(t.item_id) ?? [];
      arr.push(t);
      txsByItem.set(t.item_id, arr);
    }

    const inTypes = new Set(["IN_IMPORT", "IN_DOMESTIC", "IN_RETURN"]);
    const outTypes = new Set(["OUT_ORDER", "OUT_QUOTE"]);

    const result: InventoryItem[] = list.map((item) => {
      const snap = latestSnapByItem.get(item.id);
      const snapDateStr = snap ? snap.snapshot_at.slice(0, 10) : null;
      const code = (item.erp_code ?? "").trim();
      const excelBase = code ? (openingStockByErpCode[code] ?? 0) : 0;
      const physicalBase = snap ? snap.physical_qty : excelBase;
      const itemTxs = txsByItem.get(item.id) ?? [];

      let delta = 0;
      for (const tx of itemTxs) {
        delta += signedDeltaAfterSnapshot(tx, snapDateStr);
      }

      const current_qty = physicalBase + delta;
      const erp_qty = snap ? snap.erp_qty : null;
      const diff = erp_qty === null ? null : current_qty - erp_qty;
      const cost = item.cost_price ?? 0;
      const stock_amount = current_qty * cost;

      let in_7days = 0;
      let out_7days = 0;
      for (const row of sched) {
        if (row.item_id !== item.id) continue;
        if (inTypes.has(row.tx_type)) in_7days += row.qty;
        if (outTypes.has(row.tx_type)) out_7days += row.qty;
      }

      return {
        ...item,
        current_qty,
        erp_qty,
        diff,
        stock_amount,
        in_7days,
        out_7days,
      };
    });

    setItems(result);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { items, loading, error, refetch: fetchData };
}
