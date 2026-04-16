"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { openingStockByErpCode } from "../_data/openingStockByErpCode";

/** PM이 supabase/types에 반영하기 전까지 훅에서 사용하는 물류 테이블 Row */
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
  counterparty: string | null;
  note: string | null;
  unit_price: number | null;
  erp_synced: number | null;
};

type LogisticsDatabase = {
  public: {
    Tables: Database["public"]["Tables"] & {
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
    };
    Views: Database["public"]["Views"];
    Functions: Database["public"]["Functions"];
  };
};

export type StockMovementSummary = {
  open_qty: number;
  total_in: number;
  total_out: number;
  close_qty: number;
};

export type StockMovementRow = LogisticsTransactionRow & {
  running_balance: number;
};

function signedQty(tx: LogisticsTransactionRow): number {
  if (tx.tx_type.startsWith("IN_")) return tx.qty;
  if (tx.tx_type.startsWith("OUT_")) return -tx.qty;
  return 0;
}

export function useStockMovements(
  itemId: number,
  from: string,
  to: string,
  erpCode?: string | null
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

  const supabase = useMemo(
    () => createClient() as unknown as SupabaseClient<LogisticsDatabase>,
    []
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: snapRows, error: snapError }, { data: txRows, error: txError }] =
      await Promise.all([
        supabase
          .from("inventory_snapshots")
          .select("*")
          .eq("item_id", itemId)
          .order("snapshot_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("*")
          .eq("item_id", itemId)
          .order("tx_date", { ascending: true })
          .order("id", { ascending: true }),
      ]);

    if (snapError) {
      console.error("스냅샷 조회 실패:", snapError.message);
      setError(snapError.message);
      setSummary({ open_qty: 0, total_in: 0, total_out: 0, close_qty: 0 });
      setRows([]);
      setLoading(false);
      return;
    }
    if (txError) {
      console.error("입출고 조회 실패:", txError.message);
      setError(txError.message);
      setSummary({ open_qty: 0, total_in: 0, total_out: 0, close_qty: 0 });
      setRows([]);
      setLoading(false);
      return;
    }

    const snaps = (snapRows ?? []) as InventorySnapshotRow[];
    const allTx = (txRows ?? []) as LogisticsTransactionRow[];

    const anchor = snaps.find((s) => s.snapshot_at.slice(0, 10) < from) ?? null;

    const anchorDateStr = anchor ? anchor.snapshot_at.slice(0, 10) : null;
    const normalizedCode = (erpCode ?? "").trim();
    const excelBaseQty = normalizedCode ? (openingStockByErpCode[normalizedCode] ?? 0) : 0;
    const baseQty = anchor ? anchor.physical_qty : excelBaseQty;

    let open_qty = baseQty;
    for (const tx of allTx) {
      if (tx.tx_date >= from) break;
      if (anchorDateStr !== null && tx.tx_date <= anchorDateStr) continue;
      open_qty += signedQty(tx);
    }

    const periodTx = allTx.filter((tx) => tx.tx_date >= from && tx.tx_date <= to);

    let total_in = 0;
    let total_out = 0;
    let running = open_qty;
    const withBalance: StockMovementRow[] = periodTx.map((tx) => {
      const s = signedQty(tx);
      running += s;
      if (tx.tx_type.startsWith("IN_")) total_in += tx.qty;
      if (tx.tx_type.startsWith("OUT_")) total_out += tx.qty;
      return { ...tx, running_balance: running };
    });

    const close_qty =
      withBalance.length > 0 ? withBalance[withBalance.length - 1].running_balance : open_qty;

    setSummary({ open_qty, total_in, total_out, close_qty });
    setRows(withBalance);
    setLoading(false);
  }, [supabase, itemId, from, to, erpCode]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { summary, rows, loading, error, refetch: fetchData };
}
