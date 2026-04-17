"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ErpCrawlPanel from "./ErpCrawlPanel";
import productMaster from "./_data/product-master.json";
import { useInventory, type InventoryItem } from "./_hooks/useInventory";
import { useStockMovements, type StockMovementRow } from "./_hooks/useStockMovements";

interface StockMovementsTabProps {
  selectedItem: InventoryItem | null;
  onSelectItem: (item: InventoryItem) => void;
  onClearItem: () => void;
}

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
        in_7days: 0,
        out_7days: 0,
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
        <SelectedItemLedger selectedItem={selectedItem} onClearItem={onClearItem} />
      ) : (
        <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
          품목을 검색하거나 선택하면 입출고 내역이 표시됩니다.
        </div>
      )}
    </div>
  );
}

function SelectedItemLedger({
  selectedItem,
  onClearItem,
}: {
  selectedItem: InventoryItem;
  onClearItem: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const fixedDateFrom = "2026-04-09";
  const movement = useStockMovements(
    selectedItem.id,
    fixedDateFrom,
    today,
    selectedItem.erp_code ?? null
  );

  const summary = movement.summary;
  const rows = movement.rows;
  const movementLoading = movement.loading;
  const movementError = movement.error;
  const currentStock = summary.open_qty + summary.total_in - summary.total_out;

  const handleRefetch = (): void => {
    setRefreshKey((prev) => prev + 1);
    void movement.refetch();
  };

  const hasMissingTableError = movementError?.includes("Could not find the table");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <div>
          <p className="font-medium">{selectedItem.item_name}</p>
          <p className="text-muted-foreground text-sm">
            {selectedItem.erp_code ?? "—"} · 현재고 {selectedItem.current_qty.toLocaleString()}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClearItem}>
          다른 품목 선택
        </Button>
      </div>

      <ErpCrawlPanel
        itemId={selectedItem.id}
        itemName={selectedItem.item_name}
        erpCode={selectedItem.erp_code ?? null}
        onSuccess={handleRefetch}
      />

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">기초재고(4/8 기준)</p>
            <p className="mt-1 text-lg">{summary.open_qty.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">총 입고</p>
            <p className="mt-1 text-lg text-green-600">+{summary.total_in.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">총 출고</p>
            <p className="mt-1 text-lg text-red-500">-{summary.total_out.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs">현재 실물재고</p>
            <p className="mt-1 text-lg font-medium text-blue-600">
              {currentStock.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        현재 실물재고 = 기초재고 + 입고 − 출고 · 실시간 계산
      </p>

      <div className="mt-4">
        {movementLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <div className="rounded-md border">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10 w-full rounded-none border-b last:border-b-0" />
              ))}
            </div>
          </div>
        ) : hasMissingTableError ? (
          <p className="text-muted-foreground text-sm">
            수불 데이터 테이블이 아직 생성되지 않아 표시할 수 없습니다. (items / transactions /
            inventory_snapshots)
          </p>
        ) : movementError ? (
          <p className="text-destructive text-sm">{movementError}</p>
        ) : (
          <div key={refreshKey} className="max-h-[420px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일자</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>거래처명</TableHead>
                  <TableHead>적요</TableHead>
                  <TableHead className="text-right">입고수량</TableHead>
                  <TableHead className="text-right">출고수량</TableHead>
                  <TableHead className="text-right">재고수량</TableHead>
                  <TableHead className="text-center">ERP반영</TableHead>
                  <TableHead className="text-center">출처</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={4} className="text-muted-foreground font-medium">
                    ◀ 이월재고
                  </TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right font-medium">
                    {summary.open_qty.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">—</TableCell>
                  <TableCell className="text-center">—</TableCell>
                </TableRow>
                {rows.map((row) => {
                  const signed = signedLedgerQty(row);
                  const incoming = signed > 0 ? signed : null;
                  const outgoing = signed < 0 ? Math.abs(signed) : null;
                  const txBadge = badgeForTx(row.tx_type);
                  const erpOn = row.erp_synced === 1;
                  const rowWithSource = row as StockMovementRow & { source?: string | null };
                  const src = sourceBadge(rowWithSource.source ?? null);

                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.tx_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={txBadge.className}>
                          {txBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.counterparty ?? "—"}</TableCell>
                      <TableCell>{row.note ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {incoming !== null ? incoming.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {outgoing !== null ? outgoing.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.running_balance.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${erpOn ? "bg-emerald-500" : "bg-orange-500"}`}
                          title={erpOn ? "반영" : "미반영"}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={src.variant}
                          className={
                            src.label === "ERP" ? "bg-blue-600 text-white hover:bg-blue-600" : ""
                          }
                        >
                          {src.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function signedLedgerQty(row: StockMovementRow): number {
  if (row.tx_type.startsWith("IN_")) return row.qty;
  if (row.tx_type.startsWith("OUT_")) return -row.qty;
  return 0;
}

function badgeForTx(txType: string): { label: string; className: string } {
  if (txType === "IN_RETURN") {
    return {
      label: "반품",
      className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    };
  }
  if (txType === "OUT_ADJUST") {
    return { label: "조정", className: "bg-secondary text-secondary-foreground" };
  }
  if (txType.startsWith("IN_")) {
    return {
      label: "입고",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    };
  }
  return {
    label: "출고",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  };
}

function sourceBadge(source: string | null): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (source === "erp_crawl") return { label: "ERP", variant: "default" };
  if (source === "manual") return { label: "직접입력", variant: "secondary" };
  if (source === "excel_import") return { label: "임포트", variant: "outline" };
  return { label: "—", variant: "outline" };
}
