"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ContractTableRow, FulfillmentStatus } from "./_hooks/buildContractRows";

const FULFILLMENT_BADGE_CLASS: Record<FulfillmentStatus, string> = {
  계약: "bg-sky-600 hover:bg-sky-600",
  진행중: "bg-amber-500 hover:bg-amber-500 text-black",
  완료: "bg-emerald-600 hover:bg-emerald-600",
};

type PaymentStatus = "계약" | "진행" | "완료";

interface OrderTableProps {
  rows: Array<ContractTableRow & { paymentStatus: PaymentStatus }>;
  selectedId: string | null;
  onSelectRow: (id: string) => void; // eslint-disable-line no-unused-vars -- 콜백 시그니처 문서화
}

export default function OrderTable({ rows, selectedId, onSelectRow }: OrderTableProps) {
  const [openReturnDetailId, setOpenReturnDetailId] = useState<string | null>(null);

  return (
    // 변경 이유: 카드 overflow·스택 맥락 아래에서 클릭이 가려지지 않도록 표 영역에 쌓임 순서를 둡니다.
    <div className="relative z-10 rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>상태</TableHead>
            <TableHead>일자</TableHead>
            <TableHead>품목코드 · 품목명(규격)</TableHead>
            <TableHead>수량</TableHead>
            <TableHead>단가(CNY)</TableHead>
            <TableHead>공급가액</TableHead>
            <TableHead>부가세</TableHead>
            <TableHead>합계</TableHead>
            <TableHead>거래처명</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isSelected = selectedId === row.id;
            const returnOpen = openReturnDetailId === row.id;
            // 변경 이유: 일부 환경에서 tr 클릭이 누락될 수 있어 td에서 직접 선택합니다(펼침 버튼은 stopPropagation).
            const handleCellSelect = () => {
              onSelectRow(row.id);
            };
            return (
              <Fragment key={row.id}>
                <TableRow
                  data-state={isSelected ? "selected" : undefined}
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={cn(
                    "focus-visible:ring-ring cursor-pointer outline-none focus-visible:ring-2",
                    isSelected && "bg-primary/15 ring-primary/40 ring-2 ring-inset"
                  )}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectRow(row.id);
                    }
                  }}
                >
                  <TableCell className="cursor-pointer p-1" onClick={handleCellSelect}>
                    {row.hasReturn ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenReturnDetailId(returnOpen ? null : row.id);
                        }}
                      >
                        {returnOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    {row.hasReturn ? (
                      <Badge variant="destructive">반품</Badge>
                    ) : row.paymentStatus === "완료" ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">완료</Badge>
                    ) : row.paymentStatus === "진행" ? (
                      <Badge className="bg-amber-500 text-black hover:bg-amber-500">진행</Badge>
                    ) : (
                      <Badge className={FULFILLMENT_BADGE_CLASS.계약}>계약</Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="cursor-pointer whitespace-nowrap"
                    onClick={handleCellSelect}
                  >
                    {row.purchaseDate}
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    <div className="flex flex-col">
                      <span className="font-mono">{row.erpCode}</span>
                      <span className="text-muted-foreground">
                        {row.productName}
                        {row.unit ? ` (${row.unit})` : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    {row.quantity.toLocaleString("ko-KR")}개
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    {row.unitPriceCny !== null && row.unitPriceCny !== undefined
                      ? row.unitPriceCny.toLocaleString("ko-KR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    {row.supplyAmountCny !== null && row.supplyAmountCny !== undefined
                      ? row.supplyAmountCny.toLocaleString("ko-KR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    {row.vatAmountCny !== null && row.vatAmountCny !== undefined
                      ? row.vatAmountCny.toLocaleString("ko-KR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="cursor-pointer" onClick={handleCellSelect}>
                    {row.totalCny !== null && row.totalCny !== undefined
                      ? row.totalCny.toLocaleString("ko-KR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell
                    className="max-w-[140px] cursor-pointer truncate"
                    onClick={handleCellSelect}
                  >
                    {row.supplierName ?? "—"}
                    <span className="text-muted-foreground ml-1 block text-[10px]">
                      전표 {row.orderRef}
                    </span>
                    {row.approximate ? (
                      <Badge variant="outline" className="mt-1 text-[10px] text-amber-700">
                        근사치
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground block text-[10px]">
                        {row.fulfillmentStatus} (입고 기준)
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {row.hasReturn && returnOpen ? (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={10} className="text-muted-foreground py-3 text-[11px]">
                      <p className="text-foreground font-medium">ERP 반품 수량 (stock_movements)</p>
                      <p>
                        합계 {row.returnQty.toLocaleString("ko-KR")} — 쿠팡 물류 반품은 sku_mappings
                        경유 RPC 연동 시 표시 예정
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
