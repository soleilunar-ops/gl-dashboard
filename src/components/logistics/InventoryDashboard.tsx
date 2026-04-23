"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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

/** 화면 표와 동일 컬럼으로 전체 필터 결과를 xlsx 저장 (페이지 분할 무시) */
function downloadInventoryListExcel(rows: InventoryItem[]) {
  if (rows.length === 0) return;
  const sheetRows = rows.map((row) => ({
    순번: row.seq_no,
    품목코드: row.erp_code ?? "",
    품목명: row.item_name,
    제조년도: row.manufacture_year ?? "",
    유형: row.production_type ?? "",
    재고량: row.current_qty,
    재고금액: row.stock_amount,
  }));
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "지엘창고재고");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `지엘창고재고_${stamp}.xlsx`);
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
      if (
        row.tx_type === "purchase" ||
        row.tx_type === "return_sale" ||
        row.tx_type === "production_in"
      ) {
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

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
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
  }, [items, filter]);

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

  const handleExportExcel = useCallback(() => {
    if (filteredItems.length === 0) {
      toast.error("추출할 데이터가 없습니다.");
      return;
    }
    downloadInventoryListExcel(filteredItems);
    toast.success(`엑셀 저장 완료 (${filteredItems.length.toLocaleString()}건)`);
  }, [filteredItems]);

  return (
    <div className="space-y-4">
      <SummaryCards
        loading={loading}
        items={filteredItems}
        todayIncoming={todayIncoming}
        todayOutgoing={todayOutgoing}
      />

      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        onExportExcel={handleExportExcel}
        exportDisabled={loading || filteredItems.length === 0}
      />

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
        onPageChange={(next) => setPage(Math.max(1, Math.min(totalPages, next)))}
      />
    </div>
  );
}
