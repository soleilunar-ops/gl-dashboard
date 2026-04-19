"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import productMaster from "./_data/product-master.json";
import { useInventory, type InventoryItem } from "./_hooks/useInventory";
import { StockMovementLedgerPanel } from "./StockMovementLedgerPanel";

interface StockMovementsTabProps {
  selectedItem: InventoryItem | null;
  // eslint-disable-next-line no-unused-vars -- 콜백 시그니처
  onSelectItem: (item: InventoryItem) => void;
  onClearItem: () => void;
}

/** (레거시) 독립 탭용 검색 + 수불 패널 — 물류 메인은 GL 탭 다이얼로그로 대체 */
export default function StockMovementsTab({
  selectedItem,
  onSelectItem,
  onClearItem,
}: StockMovementsTabProps) {
  const { items, loading, error } = useInventory();
  const [searchQuery, setSearchQuery] = useState("");
  const fallbackItems = useMemo(
    () =>
      productMaster.map((row, index) => ({
        id: -(index + 1),
        seq_no: index + 1,
        item_name: row.productName,
        manufacture_year: null,
        production_type: null,
        erp_code: row.productCode,
        coupang_sku_id: null,
        cost_price: 0,
        is_active: true,
        current_qty: 0,
        erp_qty: null,
        diff: null,
        stock_amount: 0,
      })),
    []
  );
  const searchableItems = items.length > 0 ? items : fallbackItems;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchableItems.filter(
      (row) =>
        row.item_name.toLowerCase().includes(q) ||
        (row.erp_code?.toLowerCase().includes(q) ?? false)
    );
  }, [searchableItems, searchQuery]);

  const showDropdown = searchQuery.trim().length > 0 && !loading && filtered.length > 0;
  const showEmptyResult =
    searchQuery.trim().length > 0 && !loading && filtered.length === 0 && !error;

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <label className="text-muted-foreground mb-2 block text-sm">품목 검색</label>
        <Input
          placeholder="품목명 또는 ERP 코드"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
        />
        {showDropdown ? (
          <ul
            className="bg-popover text-popover-foreground absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border shadow-md"
            role="listbox"
          >
            {filtered.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                  onClick={() => {
                    onSelectItem(row);
                    setSearchQuery("");
                  }}
                >
                  <span className="font-medium">{row.item_name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{row.erp_code ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showEmptyResult ? (
          <p className="text-muted-foreground mt-2 text-xs">검색 결과가 없습니다.</p>
        ) : null}
        {error ? (
          <p className="text-destructive mt-2 text-xs">
            품목 조회 실패로 검색이 제한됩니다: {error}
          </p>
        ) : null}
      </div>

      {selectedItem ? (
        <StockMovementLedgerPanel
          selectedItem={selectedItem}
          onClearItem={onClearItem}
          closeButtonLabel="다른 품목 선택"
        />
      ) : (
        <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
          품목을 검색하거나 선택하면 입출고 내역이 표시됩니다.
        </div>
      )}
    </div>
  );
}
