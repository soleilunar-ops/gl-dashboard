"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type MovementRow = Pick<
  Tables<"stock_movement">,
  "item_id" | "movement_type" | "quantity_delta" | "movement_date"
>;

/**
 * 재고 입고·반품 집계 — 계약 이행 상태 패널용
 *
 * v6 2단 설계:
 * - 입고(inbound): movement_type='purchase' (매입 승인 시 트리거가 +quantity_delta 기록)
 * - 반품(return): movement_type='return_sale' (판매반품 승인 시 재고 복원)
 * - stock_movement 행은 orders.status='approved' 트리거로만 생성되므로 실제 집행된 수량만 반영됨
 */
export function useStockMovementsInboundReturn() {
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data, error: err } = await supabase
        .from("stock_movement")
        .select("item_id, movement_type, quantity_delta, movement_date")
        .in("movement_type", ["purchase", "return_sale"])
        .order("movement_date", { ascending: false })
        .limit(5000);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setMovements([]);
      } else {
        setMovements(data ?? []);
        setError(null);
      }
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const { inboundTotalByItem, returnTotalByItem } = useMemo(() => {
    const inbound: Record<number, number> = {};
    const ret: Record<number, number> = {};
    for (const row of movements) {
      const iid = row.item_id;
      const q = Math.abs(row.quantity_delta ?? 0);
      if (row.movement_type === "purchase") {
        inbound[iid] = (inbound[iid] ?? 0) + q;
      } else if (row.movement_type === "return_sale") {
        ret[iid] = (ret[iid] ?? 0) + q;
      }
    }
    return { inboundTotalByItem: inbound, returnTotalByItem: ret };
  }, [movements]);

  return { inboundTotalByItem, returnTotalByItem, movements, loading, error };
}
