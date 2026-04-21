"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/lib/supabase/types";

type CurrentStockRow = Pick<
  Tables<"v_current_stock">,
  | "item_id"
  | "seq_no"
  | "item_name_raw"
  | "item_name_norm"
  | "category"
  | "current_stock"
  | "base_stock_qty"
  | "base_date"
  | "last_movement_date"
  | "last_movement_type"
>;

type MovementLedgerRow = Pick<
  Tables<"stock_movement">,
  | "id"
  | "movement_date"
  | "movement_type"
  | "quantity_delta"
  | "memo"
  | "source_table"
  | "source_id"
>;

interface Props {
  itemId: number | null;
}

/** 선택된 품목의 현재 재고 정보 (v_current_stock 기반) */
export function OrdersStockSidebar({ itemId }: Props) {
  const LEDGER_FROM_DATE = "2026-04-08";
  const [row, setRow] = useState<CurrentStockRow | null>(null);
  const [movements, setMovements] = useState<MovementLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (itemId === null) {
      setRow(null);
      setMovements([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [stockRes, movementRes] = await Promise.all([
        supabase
          .from("v_current_stock")
          .select(
            "item_id, seq_no, item_name_raw, item_name_norm, category, current_stock, base_stock_qty, base_date, last_movement_date, last_movement_type"
          )
          .eq("item_id", itemId)
          .maybeSingle(),
        supabase
          .from("stock_movement")
          .select("id, movement_date, movement_type, quantity_delta, memo, source_table, source_id")
          .eq("item_id", itemId)
          .gte("movement_date", LEDGER_FROM_DATE)
          .order("movement_date", { ascending: false })
          .order("id", { ascending: false })
          .range(0, 199),
      ]);
      if (cancelled) return;
      if (stockRes.error) {
        setError(stockRes.error.message);
        setRow(null);
        setMovements([]);
      } else if (movementRes.error) {
        setError(movementRes.error.message);
        setRow(stockRes.data as CurrentStockRow | null);
        setMovements([]);
      } else {
        setRow(stockRes.data as CurrentStockRow | null);
        setMovements((movementRes.data ?? []) as MovementLedgerRow[]);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, supabase]);

  if (itemId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현재 재고</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">품목 행을 선택하세요.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현재 재고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현재 재고</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">조회 실패: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!row) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현재 재고</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">품목 정보 없음</p>
        </CardContent>
      </Card>
    );
  }

  const current = row.current_stock ?? 0;
  const base = row.base_stock_qty ?? 0;
  const delta = current - base;
  const name = row.item_name_norm ?? row.item_name_raw ?? `item_id:${row.item_id}`;
  const ledgerTotalIn = movements
    .filter((m) => (m.quantity_delta ?? 0) > 0)
    .reduce((sum, m) => sum + (m.quantity_delta ?? 0), 0);
  const ledgerTotalOut = Math.abs(
    movements
      .filter((m) => (m.quantity_delta ?? 0) < 0)
      .reduce((sum, m) => sum + (m.quantity_delta ?? 0), 0)
  );
  const ledgerNet = ledgerTotalIn - ledgerTotalOut;
  const calculatedRealStock = base + ledgerNet;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">현재 재고</CardTitle>
        <p className="text-muted-foreground text-xs">
          #{row.seq_no} · {name}
        </p>
        {row.category ? (
          <Badge variant="outline" className="mt-1 w-fit text-xs">
            {row.category}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-muted-foreground text-xs">현재 수량</p>
          <p className="text-2xl font-semibold tabular-nums">{current.toLocaleString("ko-KR")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">기준 재고</p>
            <p className="tabular-nums">{base.toLocaleString("ko-KR")}</p>
            <p className="text-muted-foreground">{row.base_date ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">누적 변동</p>
            <p className={`tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {delta >= 0 ? "+" : ""}
              {delta.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
        <div className="border-border border-t pt-2 text-xs">
          <p className="text-muted-foreground">4/8 이후 입출고 합계</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <p>
              입고:{" "}
              <span className="text-emerald-600 tabular-nums">
                +{ledgerTotalIn.toLocaleString("ko-KR")}
              </span>
            </p>
            <p>
              출고:{" "}
              <span className="text-rose-600 tabular-nums">
                -{ledgerTotalOut.toLocaleString("ko-KR")}
              </span>
            </p>
          </div>
          <p className="mt-1">
            실재고(계산):{" "}
            <span className="font-medium tabular-nums">
              {calculatedRealStock.toLocaleString("ko-KR")}
            </span>
          </p>
        </div>
        {row.last_movement_date ? (
          <div className="border-border border-t pt-2 text-xs">
            <p className="text-muted-foreground">최근 변동</p>
            <p>
              {row.last_movement_date} · {row.last_movement_type ?? "—"}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">변동 이력 없음</p>
        )}
        <div className="border-border border-t pt-2 text-xs">
          <p className="text-muted-foreground">4/8 이후 입출고 내역</p>
          {movements.length === 0 ? (
            <p className="text-muted-foreground mt-1">내역 없음</p>
          ) : (
            <div className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
              {movements.map((movement) => {
                const qty = movement.quantity_delta ?? 0;
                const signClass = qty >= 0 ? "text-emerald-600" : "text-rose-600";
                return (
                  <div key={movement.id} className="bg-muted/40 rounded px-2 py-1">
                    <p className="text-muted-foreground">
                      {movement.movement_date} · {movement.movement_type}
                    </p>
                    <p className={`font-medium tabular-nums ${signClass}`}>
                      {qty >= 0 ? "+" : ""}
                      {qty.toLocaleString("ko-KR")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
