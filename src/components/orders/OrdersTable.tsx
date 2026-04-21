"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { OrdersRejectPopover } from "./OrdersRejectPopover";
import type { OrderDashboardRow } from "./_hooks/useOrders";

interface Props {
  rows: OrderDashboardRow[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  onRowFocus: (itemId: number | null) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  onActionComplete: () => void;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR");
}

function statusColor(status: string | null): "default" | "outline" | "secondary" | "destructive" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  if (status === "pending") return "secondary";
  return "outline";
}

function rowBgClass(status: string | null): string {
  if (status === "approved") return "bg-emerald-50/40 dark:bg-emerald-950/10";
  if (status === "rejected") return "bg-rose-50/40 dark:bg-rose-950/10";
  return "";
}

/** 메인 거래 테이블 — v_orders_dashboard 기반, 행별 승인/거절 버튼 */
export function OrdersTable({
  rows,
  totalCount,
  loading,
  error,
  page,
  pageSize,
  onPageChange,
  selected,
  onSelectedChange,
  onRowFocus,
  onActionComplete,
}: Props) {
  const [submitting, setSubmitting] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allSelected =
    rows.length > 0 && rows.every((r) => r.order_id !== null && selected.has(r.order_id));
  const someSelected = rows.some((r) => r.order_id !== null && selected.has(r.order_id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      for (const r of rows) if (r.order_id !== null) next.delete(r.order_id);
    } else {
      for (const r of rows) if (r.order_id !== null) next.add(r.order_id);
    }
    onSelectedChange(next);
  };

  const toggleRow = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const handleApprove = async (id: number, action: "approve" | "unapprove") => {
    setSubmitting(id);
    try {
      const res = await fetch("/api/orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [id], action }),
      });
      if (res.ok) {
        onActionComplete();
      }
    } finally {
      setSubmitting(null);
    }
  };

  const pageNumbers = useMemo(() => {
    const nums: number[] = [];
    const start = Math.max(0, page - 2);
    const end = Math.min(totalPages - 1, page + 2);
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [page, totalPages]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected || (someSelected && "indeterminate")}
                  onCheckedChange={toggleAll}
                  aria-label="전체 선택"
                />
              </TableHead>
              <TableHead className="w-28">거래일</TableHead>
              <TableHead className="w-20">상태</TableHead>
              <TableHead className="w-20">유형</TableHead>
              <TableHead className="w-16">방향</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead className="w-28">ERP 코드</TableHead>
              <TableHead>거래처</TableHead>
              <TableHead className="w-20 text-right">수량</TableHead>
              <TableHead className="w-24 text-right">단가</TableHead>
              <TableHead className="w-28 text-right">총액</TableHead>
              <TableHead className="w-52">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell colSpan={12}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={12} className="text-destructive text-center">
                  조회 실패: {error}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground text-center">
                  조건에 맞는 거래가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                if (r.order_id === null) return null;
                const isSelected = selected.has(r.order_id);
                const isPending = r.status === "pending";
                const isApproved = r.status === "approved";
                const direction = r.stock_direction; // '입고' or '출고'
                return (
                  <TableRow
                    key={r.order_id}
                    className={`${rowBgClass(r.status)} cursor-pointer`}
                    onClick={() => r.item_id !== null && onRowFocus(r.item_id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => r.order_id !== null && toggleRow(r.order_id)}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums">{r.tx_date ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(r.status)}>{r.status_label ?? r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{r.tx_type_label ?? r.tx_type}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{direction ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-1">{r.item_name ?? r.erp_item_name_raw ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{r.erp_code ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <p className="line-clamp-1">{r.counterparty ?? "—"}</p>
                      {r.is_internal ? (
                        <Badge variant="outline" className="text-[10px]">
                          내부
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.unit_price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.total_amount)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1">
                        {isPending && r.order_id !== null ? (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={submitting === r.order_id}
                              onClick={() =>
                                r.order_id !== null && handleApprove(r.order_id, "approve")
                              }
                            >
                              {direction === "출고" ? "출고" : "입고"}
                            </Button>
                            <OrdersRejectPopover
                              orderIds={[r.order_id]}
                              triggerLabel="거절"
                              onDone={onActionComplete}
                            />
                          </>
                        ) : null}
                        {isApproved && r.order_id !== null ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={submitting === r.order_id}
                            onClick={() =>
                              r.order_id !== null && handleApprove(r.order_id, "unapprove")
                            }
                          >
                            승인 취소
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          {totalCount.toLocaleString("ko-KR")}건 · {page + 1} / {totalPages} 페이지
        </p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 0) onPageChange(page - 1);
                }}
                aria-disabled={page === 0}
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
                  {n + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page < totalPages - 1) onPageChange(page + 1);
                }}
                aria-disabled={page >= totalPages - 1}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
