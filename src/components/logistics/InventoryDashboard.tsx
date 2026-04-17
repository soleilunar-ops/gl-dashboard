"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dailyInventoryBase } from "./_data/dailyInventoryBase";
import { FilterBar, type InventoryFilter } from "./FilterBar";
import { InventoryTable } from "./InventoryTable";
import { SummaryCards } from "./SummaryCards";
import { useInventory, type InventoryItem } from "./_hooks/useInventory";

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface InventoryDashboardProps {
  onItemClick?: (item: InventoryItem) => void;
}

export default function InventoryDashboard({ onItemClick }: InventoryDashboardProps) {
  const { items, loading, error } = useInventory();
  const [filter, setFilter] = useState<InventoryFilter>({
    search: "",
    productionType: "all",
  });
  const [todayIncoming, setTodayIncoming] = useState(0);
  const [todayOutgoing, setTodayOutgoing] = useState(0);
  const [masterMessage] = useState<string | null>(
    `일일재고 기본자료 적용: ${dailyInventoryBase.length.toLocaleString()}건`
  );
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const supabaseToday = useMemo(() => createClient(), []);

  const loadTodayMovement = useCallback(async () => {
    const today = formatLocalYmd(new Date());
    // HANDOVER v6 매핑: transactions → orders, qty → quantity, IN/OUT → tx_type 기준
    // 외부 거래만(is_internal=false), 당일 거래만 집계
    const { data, error: qErr } = await supabaseToday
      .from("orders")
      .select("tx_type, quantity")
      .eq("tx_date", today)
      .eq("is_internal", false);

    if (qErr) {
      console.error("당일 입출고 집계 실패:", qErr.message);
      setTodayIncoming(0);
      setTodayOutgoing(0);
      return;
    }

    let incoming = 0;
    let outgoing = 0;
    for (const row of data ?? []) {
      if (row.tx_type === "purchase" || row.tx_type === "return_sale") {
        incoming += row.quantity;
      } else if (row.tx_type === "sale" || row.tx_type === "return_purchase") {
        outgoing += row.quantity;
      }
    }
    setTodayIncoming(incoming);
    setTodayOutgoing(outgoing);
  }, [supabaseToday]);

  useEffect(() => {
    void loadTodayMovement();
  }, [loadTodayMovement, items.length]);

  const fallbackItems = useMemo(
    () =>
      dailyInventoryBase.map((row, index) => ({
        id: -(index + 1),
        seq_no: row.seqNo,
        item_name: row.productName,
        manufacture_year: null,
        production_type: row.productionType,
        erp_code: row.productCode,
        coupang_sku_id: null,
        cost_price: row.qty === 0 ? 0 : row.amount / row.qty,
        is_active: true,
        current_qty: row.qty,
        erp_qty: null,
        diff: null,
        stock_amount: row.amount,
        in_7days: 0,
        out_7days: 0,
      })),
    []
  );

  const itemsWithMaster = useMemo((): InventoryItem[] => {
    const baseByCode = new Map(fallbackItems.map((row) => [row.erp_code, row]));
    const merged = items.map((item) => {
      const code = (item.erp_code ?? "").trim();
      const base = code ? baseByCode.get(code) : undefined;
      if (!base) return item;
      return {
        ...item,
        erp_code: code,
        item_name: base.item_name,
        production_type: base.production_type,
        current_qty: base.current_qty,
        stock_amount: base.stock_amount,
      };
    });

    if (merged.length === 0) {
      return fallbackItems;
    }

    const existingCodes = new Set(merged.map((row) => (row.erp_code ?? "").trim()));
    const extras = fallbackItems.filter((row) => !existingCodes.has((row.erp_code ?? "").trim()));
    return [...merged, ...extras];
  }, [items, fallbackItems]);

  const filteredItems = useMemo(() => {
    return itemsWithMaster.filter((row) => {
      if (filter.productionType !== "all" && row.production_type !== filter.productionType) {
        return false;
      }
      const q = filter.search.trim().toLowerCase();
      if (!q) return true;
      return (
        row.item_name.toLowerCase().includes(q) ||
        (row.erp_code?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [itemsWithMaster, filter]);

  useEffect(() => {
    setPage(1);
  }, [filter.search, filter.productionType]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const currentPageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const handleRowSelect = useCallback(
    (item: InventoryItem) => {
      onItemClick?.(item);
    },
    [onItemClick]
  );

  return (
    <div className="space-y-4">
      <SummaryCards
        loading={loading}
        items={filteredItems}
        todayIncoming={todayIncoming}
        todayOutgoing={todayOutgoing}
      />

      <FilterBar filter={filter} onFilterChange={setFilter} />

      {masterMessage ? <p className="text-muted-foreground text-sm">{masterMessage}</p> : null}
      <p className="text-muted-foreground text-xs">
        총재고현황 기본값은 `일일재고_3시스템_품목코드매핑.xlsx` 기준입니다. 매핑 규칙은
        `지엘_품목코드→품목코드`, `지엘_품목명→품목명`, `재고수량→재고량`,
        `원가_일일재고×재고수량→재고금액`으로 적용했습니다.
      </p>

      {error && items.length > 0 ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <InventoryTable
        items={currentPageItems}
        loading={loading}
        onRowSelect={handleRowSelect}
        page={safePage}
        totalPages={totalPages}
        totalCount={filteredItems.length}
        pageSize={PAGE_SIZE}
        onPrevPage={() => setPage((prev) => Math.max(1, prev - 1))}
        onNextPage={() => setPage((prev) => Math.min(totalPages, prev + 1))}
      />
    </div>
  );
}
