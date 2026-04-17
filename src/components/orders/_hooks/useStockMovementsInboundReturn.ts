"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type Movement = Pick<
  Tables<"stock_movements">,
  "product_id" | "movement_type" | "quantity" | "date"
>;

/** 입고·반품 수량 집계 — 계약 상태·반품 패널용 (movement_date → 스키마 컬럼명 date) */
export function useStockMovementsInboundReturn() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const run = async () => {
      const { data: rows, error: err } = await supabase
        .from("stock_movements")
        .select("product_id, movement_type, quantity, date")
        .in("movement_type", ["입고", "반품"])
        .order("date", { ascending: false })
        .limit(5000);

      if (err) {
        console.error("입고/반품 집계 조회 실패:", err.message);
        setError(err.message);
        setLoading(false);
        return;
      }

      setMovements((rows as Movement[]) ?? []);
      setLoading(false);
    };

    void run();
  }, [supabase]);

  const { inboundTotalByProduct, returnTotalByProduct } = useMemo(() => {
    const inbound: Record<string, number> = {};
    const ret: Record<string, number> = {};
    for (const row of movements) {
      const pid = row.product_id;
      const q = row.quantity ?? 0;
      if (row.movement_type === "입고") {
        inbound[pid] = (inbound[pid] ?? 0) + q;
      } else if (row.movement_type === "반품") {
        ret[pid] = (ret[pid] ?? 0) + q;
      }
    }
    return { inboundTotalByProduct: inbound, returnTotalByProduct: ret };
  }, [movements]);

  return { inboundTotalByProduct, returnTotalByProduct, movements, loading, error };
}
