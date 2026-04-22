"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStockMovements, type StockMovementRow } from "./_hooks/useStockMovements";
import type { InventoryItem } from "./_hooks/useInventory";

export function StockMovementLedgerPanel({
  selectedItem,
  onClearItem,
  closeButtonLabel = "닫기",
}: {
  selectedItem: InventoryItem;
  onClearItem: () => void;
  /** 탭 등에서 '다른 품목 선택' 등으로 바꿀 때 사용 */
  closeButtonLabel?: string;
}) {
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
          {closeButtonLabel}
        </Button>
      </div>

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
            수불 데이터 테이블이 아직 생성되지 않아 표시할 수 없습니다.
          </p>
        ) : movementError ? (
          <p className="text-destructive text-sm">{movementError}</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border">
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
                </TableRow>
                {rows.map((row) => {
                  const signed = signedLedgerQty(row);
                  const incoming = signed > 0 ? signed : null;
                  const outgoing = signed < 0 ? Math.abs(signed) : null;
                  const txBadge = badgeForTx(row.tx_type);
                  const erpOn = row.erp_synced === 1;

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
