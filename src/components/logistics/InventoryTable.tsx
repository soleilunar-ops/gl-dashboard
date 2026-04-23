"use client";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
  /** 1-indexed 페이지로 이동 */
  onPageChange: (page: number) => void;
}

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

/** 현재 페이지 근처 페이지 번호 윈도우 (최대 5개) */
function buildPageNumbers(page: number, totalPages: number): number[] {
  const window = 5;
  const half = Math.floor(window / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + window - 1);
  start = Math.max(1, end - window + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

export function InventoryTable({
  items,
  loading,
  onRowSelect,
  page,
  totalPages,
  totalCount,
  onPageChange,
}: InventoryTableProps) {
  const pageNumbers = buildPageNumbers(page, totalPages);
  if (loading) {
    return (
      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">순번</TableHead>
              <TableHead>품목코드</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead>제조년도</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>재고량</TableHead>
              <TableHead>재고금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
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
            <TableHead className="text-center">순번</TableHead>
            <TableHead>품목코드</TableHead>
            <TableHead>품목명</TableHead>
            <TableHead>제조년도</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>재고량</TableHead>
            <TableHead>재고금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                표시할 품목이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            items.map((row) => {
              const type = row.production_type ?? "-";
              // 유형별 색상 — 제품:#A90000(레드), 수입:#BBBF4E(올리브), 상품:#F2BE5C(골드)
              const badgeStyle =
                type === "제품"
                  ? { borderColor: "#A90000", color: "#A90000", backgroundColor: "#A9000010" }
                  : type === "수입"
                    ? { borderColor: "#BBBF4E", color: "#7A7D30", backgroundColor: "#BBBF4E14" }
                    : type === "상품"
                      ? { borderColor: "#F2BE5C", color: "#A67720", backgroundColor: "#F2BE5C1A" }
                      : undefined;

              return (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => onRowSelect(row)}
                >
                  <TableCell className="text-center">{row.seq_no}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {row.erp_code ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{row.item_name}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {row.manufacture_year ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" style={badgeStyle}>
                      {type}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.current_qty.toLocaleString()}</TableCell>
                  <TableCell>{wonFormatter.format(row.stock_amount)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {totalCount > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            총 {totalCount.toLocaleString()}건 · {page} / {totalPages} 페이지
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  text=""
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 1) onPageChange(page - 1);
                  }}
                  aria-disabled={page === 1}
                />
              </PaginationItem>
              {pageNumbers.map((n) => (
                <PaginationItem key={n}>
                  <PaginationLink
                    href="#"
                    isActive={n === page}
                    onClick={(e) => {
                      e.preventDefault();
                      onPageChange(n);
                    }}
                  >
                    {n}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  text=""
                  onClick={(e) => {
                    e.preventDefault();
                    if (page < totalPages) onPageChange(page + 1);
                  }}
                  aria-disabled={page >= totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
