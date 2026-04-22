"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveErpCodeByItem } from "@/lib/logistics/resolveErpCode";
import { createClient } from "@/lib/supabase/client";

/**
 * 신 스키마(HANDOVER v6) 매핑 메모
 * - 구 `items` → `item_master` (id→item_id, item_name→item_name_raw, cost_price→base_cost)
 * - 구 `inventory_snapshots` → `v_current_stock` 뷰 (트리거로 자동 계산된 current_stock 사용)
 * - 구 ERP 코드 → `item_erp_mapping`에서 별도 조회 (gl 시스템 우선)
 * - 구 `scheduled_transactions` → 신 스키마 미지원 (UI 미표시)
 * - erp_qty/diff: 신 스키마는 ERP 재고를 신뢰하지 않아 미수집 (HANDOVER v6 원칙 5번) → null
 */

export type InventoryItem = {
  id: number;
  seq_no: number;
  item_name: string;
  manufacture_year: string | null;
  production_type: string | null;
  erp_code: string | null;
  coupang_sku_id: string | null;
  cost_price: number | null;
  is_active: boolean;
  current_qty: number;
  erp_qty: number | null;
  diff: number | null;
  stock_amount: number;
};

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. v_current_stock 뷰: 144 품목 + 현재 재고 + 베이스 정보
    const { data: stockRows, error: stockError } = await supabase
      .from("v_current_stock")
      .select("*")
      .eq("is_active", true)
      .order("seq_no", { ascending: true });

    if (stockError) {
      console.error("재고 조회 실패:", stockError.message);
      setError(stockError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const stocks = stockRows ?? [];
    if (stocks.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const itemIds = stocks.map((r) => r.item_id).filter((id): id is number => id !== null);

    // 2. ERP 매핑 (gl 우선, 없으면 glpharm/hnb)
    const { data: erpMappings } = await supabase
      .from("item_erp_mapping")
      .select("item_id, erp_system, erp_code")
      .in("item_id", itemIds);

    const erpCodeByItem = resolveErpCodeByItem(erpMappings ?? []);

    // 3. 쿠팡 매핑 (첫 번째 SKU만, 다중 매핑은 _data가 처리)
    const { data: coupangMappings } = await supabase
      .from("item_coupang_mapping")
      .select("item_id, coupang_sku_id")
      .in("item_id", itemIds);

    const coupangSkuByItem = new Map<number, string>();
    for (const m of coupangMappings ?? []) {
      if (!coupangSkuByItem.has(m.item_id)) {
        coupangSkuByItem.set(m.item_id, m.coupang_sku_id);
      }
    }

    const result: InventoryItem[] = stocks.map((row) => {
      const itemId = row.item_id ?? 0;
      const currentQty = row.current_stock ?? row.base_stock_qty ?? 0;
      const cost = row.base_cost ?? 0;
      return {
        id: itemId,
        seq_no: row.seq_no ?? 0,
        item_name: row.item_name_raw ?? "",
        manufacture_year: row.manufacture_year,
        production_type: row.item_type,
        erp_code: erpCodeByItem.get(itemId) ?? null,
        coupang_sku_id: coupangSkuByItem.get(itemId) ?? null,
        cost_price: cost,
        is_active: row.is_active ?? true,
        current_qty: currentQty,
        erp_qty: null,
        diff: null,
        stock_amount: currentQty * cost,
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
