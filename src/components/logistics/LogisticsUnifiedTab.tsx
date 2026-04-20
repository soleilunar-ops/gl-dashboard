"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GlWarehouseTrendChart } from "./GlWarehouseTrendChart";
import { useInventory } from "./_hooks/useInventory";

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeCoupangCenter(c: string | null): string {
  return (c ?? "").trim() || "-";
}

/** 최신일 행의 발주 문구를 통합 카드용 세 가지로 나눈다 */
function classifyCoupangOrderBucket(
  status: string | null,
  detail: string | null
): "ok" | "suspended" | "blocked" {
  const s = `${status ?? ""} ${detail ?? ""}`;
  if (/일시중단/.test(s)) return "suspended";
  if (/발주불가|단종/.test(s)) return "blocked";
  return "ok";
}

export default function LogisticsUnifiedTab() {
  const { items, loading: invLoading } = useInventory();
  const [todayIn, setTodayIn] = useState(0);
  const [todayOut, setTodayOut] = useState(0);
  const [coupangBoxSum, setCoupangBoxSum] = useState<number | null>(null);
  const [coupangSkuCount, setCoupangSkuCount] = useState(0);
  const [coupangCenterCount, setCoupangCenterCount] = useState(0);
  const [coupangOrderOk, setCoupangOrderOk] = useState(0);
  const [coupangOrderSuspended, setCoupangOrderSuspended] = useState(0);
  const [coupangOrderBlocked, setCoupangOrderBlocked] = useState(0);
  const [coupangLoading, setCoupangLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const loadToday = useCallback(async () => {
    const today = formatLocalYmd(new Date());
    const { data, error } = await supabase
      .from("orders")
      .select("tx_type, quantity")
      .eq("tx_date", today)
      .eq("is_internal", false);
    if (error) {
      setTodayIn(0);
      setTodayOut(0);
      return;
    }
    let incoming = 0;
    let outgoing = 0;
    for (const row of data ?? []) {
      if (row.tx_type === "purchase" || row.tx_type === "return_sale") incoming += row.quantity;
      else if (row.tx_type === "sale" || row.tx_type === "return_purchase")
        outgoing += row.quantity;
    }
    setTodayIn(incoming);
    setTodayOut(outgoing);
  }, [supabase]);

  const loadCoupang = useCallback(async () => {
    setCoupangLoading(true);
    const resetCoupang = () => {
      setCoupangBoxSum(null);
      setCoupangSkuCount(0);
      setCoupangCenterCount(0);
      setCoupangOrderOk(0);
      setCoupangOrderSuspended(0);
      setCoupangOrderBlocked(0);
    };
    const { data: latest, error: e1 } = await supabase
      .from("inventory_operation")
      .select("op_date")
      .order("op_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1 || !latest?.op_date) {
      resetCoupang();
      setCoupangLoading(false);
      return;
    }
    const { data: rows, error: e2 } = await supabase
      .from("inventory_operation")
      .select("sku_id, center, current_stock, order_status, order_status_detail")
      .eq("op_date", latest.op_date);
    if (e2) {
      resetCoupang();
      setCoupangLoading(false);
      return;
    }
    const list = rows ?? [];
    let sum = 0;
    const skuSet = new Set<string>();
    const centerSet = new Set<string>();
    let ok = 0;
    let suspended = 0;
    let blocked = 0;
    for (const r of list) {
      sum += r.current_stock ?? 0;
      skuSet.add(String(r.sku_id ?? ""));
      centerSet.add(normalizeCoupangCenter(r.center));
      const b = classifyCoupangOrderBucket(r.order_status, r.order_status_detail);
      if (b === "suspended") suspended += 1;
      else if (b === "blocked") blocked += 1;
      else ok += 1;
    }
    setCoupangBoxSum(sum);
    setCoupangSkuCount(skuSet.size);
    setCoupangCenterCount(centerSet.size);
    setCoupangOrderOk(ok);
    setCoupangOrderSuspended(suspended);
    setCoupangOrderBlocked(blocked);
    setCoupangLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadToday();
  }, [loadToday, items.length]);

  useEffect(() => {
    void loadCoupang();
  }, [loadCoupang]);

  const glQty = useMemo(() => items.reduce((a, r) => a + (r.current_qty ?? 0), 0), [items]);
  const loading = invLoading;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        GL 창고와 쿠팡 센터 재고를 한눈에 요약합니다. 상세는 각 탭에서 확인하세요.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">GL 창고 재고(수량 합)</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-28" />
            ) : (
              <p className="mt-1 text-xl font-medium tabular-nums">{glQty.toLocaleString()}</p>
            )}
            <p className="text-muted-foreground mt-1 text-xs">{items.length} 품목</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">오늘 입고 / 출고</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-medium text-emerald-600 tabular-nums">
                +{todayIn.toLocaleString()}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-lg font-medium text-rose-600 tabular-nums">
                −{todayOut.toLocaleString()}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">GL 창고 · orders 기준</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">쿠팡 센터 재고</p>
            {coupangLoading ? (
              <Skeleton className="mt-2 h-8 w-28" />
            ) : (
              <p className="mt-1 text-xl font-medium tabular-nums">
                {(coupangBoxSum ?? 0).toLocaleString()}
              </p>
            )}
            <div className="text-muted-foreground mt-1 text-xs">
              {coupangLoading ? (
                <Skeleton className="mt-1 h-4 w-32" />
              ) : (
                <>
                  {coupangSkuCount.toLocaleString("ko-KR")} SKU ·{" "}
                  {coupangCenterCount.toLocaleString("ko-KR")} 센터
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">쿠팡 발주 상태</p>
            {coupangLoading ? (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <ul className="text-foreground mt-2 space-y-1.5 text-sm tabular-nums">
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">발주상태</span>
                  <span className="font-medium">{coupangOrderOk.toLocaleString("ko-KR")}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">일시중단</span>
                  <span className="font-medium">
                    {coupangOrderSuspended.toLocaleString("ko-KR")}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">발주불가</span>
                  <span className="font-medium">{coupangOrderBlocked.toLocaleString("ko-KR")}</span>
                </li>
              </ul>
            )}
            <p className="text-muted-foreground mt-2 text-[11px] leading-snug">
              최신 기준일 행 기준
            </p>
          </CardContent>
        </Card>
      </div>

      <GlWarehouseTrendChart />
    </div>
  );
}
