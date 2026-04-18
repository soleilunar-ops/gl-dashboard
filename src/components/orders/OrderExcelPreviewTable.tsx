"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PurchaseExcelParsedRow } from "@/lib/orders/purchaseExcel";

interface Props {
  rows: PurchaseExcelParsedRow[];
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR");
}

/** 엑셀 파싱 결과 미리보기 테이블 — shadcn Table (네이티브 <table> 금지 규칙 준수) */
export default function OrderExcelPreviewTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground border-border rounded-md border p-6 text-center text-sm">
        파일을 업로드하거나 샘플을 불러오세요.
      </div>
    );
  }

  const displayed = rows.slice(0, 100);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead className="w-28">전표번호</TableHead>
            <TableHead className="w-28">거래일</TableHead>
            <TableHead className="w-28">품목코드</TableHead>
            <TableHead>품목명</TableHead>
            <TableHead className="w-20 text-right">수량</TableHead>
            <TableHead className="w-24 text-right">단가(CNY)</TableHead>
            <TableHead className="w-28 text-right">합계(CNY)</TableHead>
            <TableHead>거래처</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayed.map((r, idx) => (
            <TableRow key={`${r.erpRef}-${r.erpCode}-${idx}`}>
              <TableCell className="text-xs tabular-nums">{idx + 1}</TableCell>
              <TableCell className="text-xs tabular-nums">{r.erpRef}</TableCell>
              <TableCell className="text-xs tabular-nums">{r.purchaseDateIso}</TableCell>
              <TableCell className="text-xs tabular-nums">{r.erpCode}</TableCell>
              <TableCell className="text-xs">
                <p className="line-clamp-1">{r.productName}</p>
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatNumber(r.quantity)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatNumber(r.unitPriceCny)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatNumber(r.totalCny)}
              </TableCell>
              <TableCell className="text-xs">
                <p className="line-clamp-1">{r.supplierName ?? "—"}</p>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > displayed.length ? (
        <p className="text-muted-foreground border-t p-2 text-center text-xs">
          상위 {displayed.length}건만 표시 · 전체 {rows.length.toLocaleString("ko-KR")}건은 DB 반영
          시 적용
        </p>
      ) : null}
    </div>
  );
}
