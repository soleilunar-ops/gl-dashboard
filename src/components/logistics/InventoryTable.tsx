"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { InventoryItem } from "./_hooks/useInventory";

interface InventoryTableProps {
  items: InventoryItem[];
  loading: boolean;
  onRowSelect: (item: InventoryItem) => void;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

export function InventoryTable({
  items,
  loading,
  onRowSelect,
  page,
  totalPages,
  totalCount,
  pageSize,
  onPrevPage,
  onNextPage,
}: InventoryTableProps) {
  if (loading) {
    return (
      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>순번</TableHead>
              <TableHead>품목코드</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>재고량</TableHead>
              <TableHead>재고금액</TableHead>
              <TableHead>입고예정(7일)</TableHead>
              <TableHead>출고예정(7일)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="bg-card overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>순번</TableHead>
            <TableHead>품목코드</TableHead>
            <TableHead>품목명</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>재고량</TableHead>
            <TableHead>재고금액</TableHead>
            <TableHead>입고예정(7일)</TableHead>
            <TableHead>출고예정(7일)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                표시할 품목이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            items.map((row) => {
              const type = row.production_type ?? "-";
              const badgeClass =
                type === "제품"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                  : type === "수입"
                    ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    : type === "상품"
                      ? "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200"
                      : "";

              return (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => onRowSelect(row)}
                >
                  <TableCell>{row.seq_no}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {row.erp_code ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{row.item_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={badgeClass}>
                      {type}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.current_qty.toLocaleString()}</TableCell>
                  <TableCell>{wonFormatter.format(row.stock_amount)}</TableCell>
                  <TableCell>{row.in_7days.toLocaleString()}</TableCell>
                  <TableCell>{row.out_7days.toLocaleString()}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {totalCount > 0 ? (
        <div className="flex items-center justify-between border-t px-3 py-2">
          <p className="text-muted-foreground text-xs">
            총 {totalCount.toLocaleString()}건 · {page}/{totalPages}페이지 (페이지당 {pageSize}건)
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={onPrevPage}
            >
              이전
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={onNextPage}
            >
              다음
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
