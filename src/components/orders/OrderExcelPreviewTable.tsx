"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PurchaseExcelParsedRow } from "@/lib/orders/purchaseExcel";
import { excelPreviewRowKey } from "./_hooks/buildContractRows";

const PAGE_SIZE = 10;
type PaymentStatus = "계약" | "진행" | "완료";

type RowDocument = {
  fileName: string;
  fileUrl: string;
};

function fmtMoney(n: number): string {
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  rows: PurchaseExcelParsedRow[];
  emptyHint?: string;
  /** 선택된 행 키(`excelPreviewRowKey`) — 송금 계산기와 동기화 */
  selectedKey?: string | null;
  statusByRowKey?: Record<string, PaymentStatus>;
  onSelectRow?: (picked: PurchaseExcelParsedRow) => void; // eslint-disable-line no-unused-vars -- 시그니처용
};

/** 제출용 구매현황 열 구조 미리보기 — 헤더 고정(sticky), 본문 10건 페이징, 행 클릭 선택 */
export default function OrderExcelPreviewTable({
  rows,
  emptyHint,
  selectedKey = null,
  statusByRowKey = {},
  onSelectRow,
}: Props) {
  const [page, setPage] = useState(1);
  const [docByRowKey, setDocByRowKey] = useState<Record<string, RowDocument>>({});
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [activeDocRowKey, setActiveDocRowKey] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const safe = Math.min(page, totalPages);
    const start = (safe - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page, totalPages]);

  const activeDoc = activeDocRowKey ? (docByRowKey[activeDocRowKey] ?? null) : null;

  const handleAttachPdf = (rowKey: string, file: File | null) => {
    if (!file) {
      return;
    }
    const fileUrl = URL.createObjectURL(file);
    setDocByRowKey((prev) => {
      const current = prev[rowKey];
      if (current && current.fileUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.fileUrl);
      }
      return {
        ...prev,
        [rowKey]: {
          fileName: file.name,
          fileUrl,
        },
      };
    });
  };

  const openDocDialog = (rowKey: string) => {
    setActiveDocRowKey(rowKey);
    setDocDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[min(70vh,560px)] overflow-auto rounded-md border">
        <table className="w-full caption-bottom text-xs">
          <TableHeader className="bg-card [&_th]:bg-card sticky top-0 z-20 border-b shadow-sm">
            <TableRow>
              {/* 변경 이유: 사용성 요청에 맞춰 헤더 행 텍스트를 셀 중앙에 정렬합니다. */}
              <TableHead className="text-center">상태</TableHead>
              <TableHead className="text-center">일자</TableHead>
              <TableHead className="text-center">품목코드</TableHead>
              <TableHead className="text-center">품목명(규격)</TableHead>
              <TableHead className="text-center">수량</TableHead>
              <TableHead className="text-center">단가(CNY)</TableHead>
              <TableHead className="text-center">공급가액</TableHead>
              <TableHead className="text-center">부가세</TableHead>
              <TableHead className="text-center">합계</TableHead>
              <TableHead className="text-center">거래처명</TableHead>
              <TableHead className="text-center">서류</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-muted-foreground py-8 text-center">
                  {emptyHint ??
                    "필터에 맞는 DB 계약이 없을 때는 여기에 엑셀 미리보기가 표시됩니다. 아래에서 파일을 업로드하거나 샘플을 불러오세요."}
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row, idx) => {
                const key = excelPreviewRowKey(row);
                const isSelected = selectedKey !== null && selectedKey === key;
                const paymentStatus = statusByRowKey[key] ?? "계약";
                const pick = () => {
                  onSelectRow?.(row);
                };
                return (
                  <TableRow
                    key={`${row.erpRef}-${row.erpCode}-${idx}`}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(
                      onSelectRow && "cursor-pointer",
                      isSelected && "bg-primary/15 ring-primary/40 ring-2 ring-inset"
                    )}
                  >
                    <TableCell
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {/* 변경 이유: 상태는 수정 불가(비활성) 버튼으로 보여주고 송금 진행률에 따라 자동 반영되게 합니다. */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled
                        className={cn(
                          "h-7 w-[90px] justify-center px-2 disabled:opacity-100",
                          paymentStatus === "완료" && "border-emerald-600 text-emerald-700",
                          paymentStatus === "진행" && "border-amber-500 text-amber-700",
                          paymentStatus === "계약" && "border-sky-600 text-sky-700"
                        )}
                      >
                        {paymentStatus}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono whitespace-nowrap" onClick={pick}>
                      <div>
                        <p>{row.purchaseDateIso}</p>
                        <p className="text-muted-foreground text-[10px]">{row.erpRef}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono" onClick={pick}>
                      {row.erpCode}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate"
                      title={row.productName}
                      onClick={pick}
                    >
                      {row.productName}
                    </TableCell>
                    <TableCell className="text-right" onClick={pick}>
                      {row.quantity.toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-right" onClick={pick}>
                      {fmtMoney(row.unitPriceCny)}
                    </TableCell>
                    <TableCell className="text-right" onClick={pick}>
                      {fmtMoney(row.supplyAmount)}
                    </TableCell>
                    <TableCell className="text-right" onClick={pick}>
                      {fmtMoney(row.vatAmount)}
                    </TableCell>
                    <TableCell className="text-right" onClick={pick}>
                      {fmtMoney(row.totalCny)}
                    </TableCell>
                    <TableCell onClick={pick}>{row.supplierName}</TableCell>
                    <TableCell
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {/* 변경 이유: 첨부/조회/다운 동작을 단일 버튼-팝업 구조로 단순화해 사용 흐름을 일관되게 만듭니다. */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => openDocDialog(key)}
                      >
                        서류
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-muted-foreground">
            총 {rows.length.toLocaleString("ko-KR")}건 · 페이지 {page}/{totalPages} (페이지당{" "}
            {PAGE_SIZE}
            건)
            {onSelectRow ? " · 행 클릭 시 아래 송금 계산기에 반영됩니다." : null}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              이전
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              다음
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>서류 확인</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="excel-doc-attach"
                className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs"
              >
                PDF 첨부
              </label>
              <input
                id="excel-doc-attach"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (activeDocRowKey) {
                    handleAttachPdf(activeDocRowKey, file);
                  }
                  event.target.value = "";
                }}
              />
              {activeDoc ? (
                <span className="text-muted-foreground text-xs">{activeDoc.fileName}</span>
              ) : null}
              {activeDoc ? (
                <a
                  href={activeDoc.fileUrl}
                  download={activeDoc.fileName}
                  className="inline-flex h-8 items-center rounded-md border px-3 text-xs"
                >
                  다운로드
                </a>
              ) : null}
            </div>
            {activeDoc ? (
              <>
                {/* 변경 이유: 첨부된 PDF를 팝업 내에서 바로 확인할 수 있도록 iframe 미리보기를 제공합니다. */}
                <iframe
                  title="첨부 서류 미리보기"
                  src={activeDoc.fileUrl}
                  className="h-[65vh] w-full rounded-md border"
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">첨부 서류 없음</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
