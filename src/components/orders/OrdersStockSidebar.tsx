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

interface Props {
  itemId: number | null;
}

/** 선택된 품목의 현재 재고 정보 (v_current_stock 기반) */
export function OrdersStockSidebar({ itemId }: Props) {
  const [row, setRow] = useState<CurrentStockRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (itemId === null) {
      setRow(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error: err } = await supabase
        .from("v_current_stock")
        .select(
          "item_id, seq_no, item_name_raw, item_name_norm, category, current_stock, base_stock_qty, base_date, last_movement_date, last_movement_type"
        )
        .eq("item_id", itemId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRow(null);
      } else {
        setRow(data as CurrentStockRow | null);
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
      </CardContent>
    </Card>
  );
}
