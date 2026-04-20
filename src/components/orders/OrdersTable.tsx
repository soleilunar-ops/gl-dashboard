"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { OrderDashboardRow } from "./_hooks/useOrders";
import { parseDashboardMemo, type DashboardMemoOverlay } from "@/lib/orders/orderDashMemo";
import { toast } from "sonner";
import { Eye, FileIcon } from "lucide-react";

/** 서버 저장된 서류 목록(API 응답) */
type PersistedOrderDocument = {
  id: string;
  file_name: string;
  created_at?: string;
  signed_url: string | null;
};

interface Props {
  rows: OrderDashboardRow[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  onRowFocus: (row: OrderDashboardRow) => void;
}

/**
 * 화면 한글 헤더 ↔ v_orders_dashboard 저장 필드 — 변경 이유: ERP 적재 스키마와 표시명을 한곳에서 매핑
 * (이카운트 원본 엑셀 헤더는 크롤러에서 이미 tx_date·erp_code 등으로 정규화됨)
 */
const ORDER_TABLE_COLUMNS = [
  { header: "계약일", source: "tx_date" },
  { header: "품목코드 및 품목명", source: "erp_code_item_name" },
  { header: "수량", source: "quantity" },
  { header: "단가(통화)", source: "unit_price" },
  { header: "공급가액", source: "supply_amount" },
  { header: "부가세", source: "vat" },
  { header: "합계", source: "total_amount" },
  { header: "거래처명", source: "counterparty" },
] as const;

type OrderTableColumnSource = (typeof ORDER_TABLE_COLUMNS)[number]["source"];

const COL_COUNT = 2 + ORDER_TABLE_COLUMNS.length + 1;

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR");
}

/** 단가(통화) 열 — 변경 이유: DB에 통화 코드가 없어 대시보드 기본값 KRW로 표시 */
function formatCurrencyKRW(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(v);
}

function formatContractDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : raw;
}

function effectiveReceivedQty(r: OrderDashboardRow, overlay: DashboardMemoOverlay): number {
  if (overlay.rq !== undefined) return overlay.rq;
  if (r.stock_movement_id != null && r.quantity_delta != null) {
    return Math.abs(Number(r.quantity_delta));
  }
  return 0;
}

function receiptRatio(contractQty: number, receivedQty: number): number {
  if (contractQty <= 0) return 1;
  return Math.min(Math.max(receivedQty / contractQty, 0), 1);
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type StatusOverride = "auto" | "cancelled";

function statusFromRow(
  r: OrderDashboardRow,
  ratio: number,
  override: StatusOverride
): { label: string; variant: BadgeVariant; className?: string } {
  if (override === "cancelled") {
    return { label: "승인취소", variant: "destructive" };
  }
  if (r.status === "rejected") {
    return { label: "승인취소", variant: "destructive" };
  }
  if (r.status === "approved") {
    return { label: "승인완료", variant: "default" };
  }
  if (r.status === "pending") {
    /** 부분 이행만 진행 중 — 변경 이유: 누적 실입고가 계약보다 적을 때 승인진행 표시 */
    if (ratio > 1e-9 && ratio < 1 - 1e-9) {
      return {
        label: "승인진행",
        variant: "outline",
        className: "border-sky-500/70 text-sky-900 dark:text-sky-100",
      };
    }
    if (ratio < 1 - 1e-9) {
      return {
        label: "승인대기",
        variant: "outline",
        className: "border-amber-400/80 text-amber-800 dark:text-amber-200",
      };
    }
    return { label: "승인완료", variant: "default" };
  }
  return { label: r.status_label ?? "승인완료", variant: "default" };
}

function rowBgClass(status: string | null): string {
  if (status === "approved") return "bg-emerald-50/40 dark:bg-emerald-950/10";
  if (status === "rejected") return "bg-rose-50/40 dark:bg-rose-950/10";
  return "";
}

/** 팝업 내 미리보기 가능 여부 — 변경 이유: type 미부여 파일(.pdf 등) 대비 */
function docPreviewKind(file: File): "pdf" | "image" | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name)) return "image";
  return null;
}

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
}: Props) {
  const [attachmentsByOrder, setAttachmentsByOrder] = useState<Record<number, File[]>>({});
  const [docOrderId, setDocOrderId] = useState<number | null>(null);
  const [persistedDocs, setPersistedDocs] = useState<PersistedOrderDocument[]>([]);
  const [docListLoading, setDocListLoading] = useState(false);
  const [docSaving, setDocSaving] = useState(false);
  const [docPreview, setDocPreview] = useState<{
    url: string;
    kind: "pdf" | "image";
    name: string;
  } | null>(null);

  const clearDocPreview = useCallback(() => {
    setDocPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const openDocPreview = useCallback((file: File) => {
    const kind = docPreviewKind(file);
    if (!kind) return;
    setDocPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(file), kind, name: file.name };
    });
  }, []);

  useEffect(() => {
    clearDocPreview();
  }, [docOrderId, clearDocPreview]);

  useEffect(() => {
    if (docOrderId === null) {
      setPersistedDocs([]);
      return;
    }
    let cancelled = false;
    setDocListLoading(true);
    void fetch(`/api/orders/order-documents?orderId=${docOrderId}`)
      .then((res) => res.json())
      .then((body: { documents?: PersistedOrderDocument[]; error?: string }) => {
        if (cancelled) return;
        if (body.documents && Array.isArray(body.documents)) {
          setPersistedDocs(body.documents);
        } else {
          setPersistedDocs([]);
        }
      })
      .catch(() => {
        if (!cancelled) setPersistedDocs([]);
      })
      .finally(() => {
        if (!cancelled) setDocListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docOrderId]);

  const saveOrderDocuments = useCallback(async () => {
    if (docOrderId === null) return;
    const files = attachmentsByOrder[docOrderId] ?? [];
    if (files.length === 0) {
      toast.error("저장할 새 파일을 먼저 추가해 주세요.");
      return;
    }
    setDocSaving(true);
    try {
      const form = new FormData();
      form.append("orderId", String(docOrderId));
      for (const f of files) {
        form.append("files", f);
      }
      const res = await fetch("/api/orders/order-documents", { method: "POST", body: form });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? "저장에 실패했습니다.");
      toast.success("서류가 해당 계약(주문)에 저장되었습니다.");
      setAttachmentsByOrder((prev) => ({ ...prev, [docOrderId]: [] }));
      const listRes = await fetch(`/api/orders/order-documents?orderId=${docOrderId}`);
      const listBody = (await listRes.json()) as { documents?: PersistedOrderDocument[] };
      if (listRes.ok && Array.isArray(listBody.documents)) {
        setPersistedDocs(listBody.documents);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setDocSaving(false);
    }
  }, [docOrderId, attachmentsByOrder]);

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

  const pageNumbers = useMemo(() => {
    const nums: number[] = [];
    const start = Math.max(0, page - 2);
    const end = Math.min(totalPages - 1, page + 2);
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [page, totalPages]);

  const dialogFiles = docOrderId !== null ? (attachmentsByOrder[docOrderId] ?? []) : [];
  const stickyBg = "bg-background";
  const stickyHead = `${stickyBg} backdrop-blur-sm`;

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <div className="relative max-w-full overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className={`border-border sticky left-0 z-40 min-w-10 border-r ${stickyHead} text-center align-middle`}
                >
                  <div className="flex justify-center">
                    <Checkbox
                      checked={allSelected || (someSelected && "indeterminate")}
                      onCheckedChange={toggleAll}
                      aria-label="전체 선택"
                    />
                  </div>
                </TableHead>
                <TableHead
                  className={`border-border sticky left-10 z-40 min-w-[88px] border-r ${stickyHead} text-center`}
                >
                  상태
                </TableHead>
                {ORDER_TABLE_COLUMNS.map((col) => (
                  <TableHead
                    key={col.source}
                    title={
                      col.source === "erp_code_item_name"
                        ? "erp_code · item_name (없으면 erp_item_name_raw)"
                        : `v_orders_dashboard.${col.source}`
                    }
                    className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap"
                  >
                    {col.header}
                  </TableHead>
                ))}
                <TableHead className="bg-muted/60 min-w-[88px] text-center text-xs whitespace-nowrap">
                  서류
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell colSpan={COL_COUNT}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="text-destructive text-center">
                    조회 실패: {error}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="text-muted-foreground text-center">
                    조건에 맞는 거래가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  if (r.order_id === null) return null;
                  const oid = r.order_id;
                  const isSelected = selected.has(oid);
                  const overlay = parseDashboardMemo(r.memo);
                  const contractQty = Number(r.quantity ?? 0);
                  const receivedQty = effectiveReceivedQty(r, overlay);
                  const ratio = receiptRatio(contractQty, receivedQty);
                  const statusDisp = statusFromRow(r, ratio, "auto");

                  return (
                    <TableRow
                      key={oid}
                      className={`${rowBgClass(r.status)} cursor-pointer`}
                      onClick={() => onRowFocus(r)}
                    >
                      <TableCell
                        className={`border-border sticky left-0 z-30 min-w-10 border-r ${stickyBg} text-center align-middle`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(oid)}
                            aria-label={`행 선택 ${oid}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell
                        className={`border-border sticky left-10 z-30 min-w-[88px] border-r ${stickyBg} text-center align-middle`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-center">
                          <Badge variant={statusDisp.variant} className={statusDisp.className}>
                            {statusDisp.label}
                          </Badge>
                        </div>
                      </TableCell>
                      {ORDER_TABLE_COLUMNS.map((col) => {
                        const src = col.source as OrderTableColumnSource;
                        if (src === "quantity") {
                          return (
                            <TableCell key={src} className="text-center text-xs tabular-nums">
                              <div className="flex flex-col items-center gap-0.5">
                                <span>
                                  {formatNumber(receivedQty)}
                                  <span className="text-muted-foreground"> / </span>
                                  {formatNumber(contractQty)}
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  누적 실입고 / 계약
                                </span>
                              </div>
                            </TableCell>
                          );
                        }
                        if (src === "tx_date") {
                          const raw = r.tx_date;
                          return (
                            <TableCell key={src} className="text-center text-xs tabular-nums">
                              {raw ? formatContractDate(String(raw)) : "—"}
                            </TableCell>
                          );
                        }
                        if (src === "erp_code_item_name") {
                          return (
                            <TableCell key={src} className="max-w-[280px] text-center">
                              <div className="flex flex-col items-center gap-0.5 text-center">
                                <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                                  {r.erp_code ?? "—"}
                                </span>
                                <span className="line-clamp-2 text-xs">
                                  {r.item_name ?? r.erp_item_name_raw ?? "—"}
                                </span>
                              </div>
                            </TableCell>
                          );
                        }
                        if (src === "unit_price") {
                          return (
                            <TableCell key={src} className="text-center text-xs tabular-nums">
                              {formatCurrencyKRW(r.unit_price)}
                            </TableCell>
                          );
                        }
                        if (src === "supply_amount" || src === "vat" || src === "total_amount") {
                          const n = r[src];
                          return (
                            <TableCell key={src} className="text-center text-xs tabular-nums">
                              {formatNumber(n)}
                            </TableCell>
                          );
                        }
                        if (src === "counterparty") {
                          return (
                            <TableCell
                              key={src}
                              className="max-w-[160px] truncate text-center text-xs"
                            >
                              {r.counterparty ?? "—"}
                            </TableCell>
                          );
                        }
                        return null;
                      })}
                      <TableCell
                        className="text-center align-middle text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 px-2 text-xs"
                            onClick={() => setDocOrderId(oid)}
                          >
                            서류
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={docOrderId !== null}
        onOpenChange={(open) => {
          if (!open) {
            clearDocPreview();
            setDocOrderId(null);
          }
        }}
      >
        <DialogContent showCloseButton className="flex max-h-[90vh] flex-col gap-4 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>서류</DialogTitle>
            <DialogDescription>
              주문 ID {docOrderId ?? ""} 계약 건에 서류를 저장하면 Supabase에 보관되며, 아래
              「저장」 후 다른 세션에서도 같은 목록으로 조회할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="space-y-1">
              <p className="text-xs font-medium">저장된 서류</p>
              <ul className="border-border bg-muted/20 max-h-28 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
                {docListLoading ? (
                  <li className="text-muted-foreground py-2 text-center">불러오는 중…</li>
                ) : persistedDocs.length === 0 ? (
                  <li className="text-muted-foreground py-2 text-center">
                    저장된 파일이 없습니다.
                  </li>
                ) : (
                  persistedDocs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <FileIcon className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="truncate">{doc.file_name}</span>
                      </span>
                      {doc.signed_url ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          asChild
                        >
                          <a href={doc.signed_url} target="_blank" rel="noopener noreferrer">
                            열기
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">URL 생성 실패</span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <label className="flex cursor-pointer flex-col gap-2 text-xs">
              <span className="font-medium">파일 추가 (저장 시 업로드)</span>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf"
                className="text-muted-foreground file:bg-muted text-xs file:mr-2 file:rounded file:border file:px-2 file:py-1"
                onChange={(e) => {
                  if (docOrderId === null) return;
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  if (!files.length) return;
                  setAttachmentsByOrder((prev) => ({
                    ...prev,
                    [docOrderId]: [...(prev[docOrderId] ?? []), ...files],
                  }));
                  e.target.value = "";
                }}
              />
            </label>
            <ul className="border-border max-h-36 shrink-0 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
              {dialogFiles.length === 0 ? (
                <li className="text-muted-foreground py-4 text-center">
                  추가한 새 파일이 없습니다. 업로드 후 「저장」을 누르세요.
                </li>
              ) : (
                dialogFiles.map((file, i) => (
                  <li
                    key={`${file.name}-${i}-${file.lastModified}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <FileIcon className="text-muted-foreground size-3.5 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          const url = URL.createObjectURL(file);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = file.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        내려받기
                      </Button>
                      {docPreviewKind(file) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => openDocPreview(file)}
                        >
                          <Eye className="mr-1 size-3.5" />
                          미리보기
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))
              )}
            </ul>
            {docPreview ? (
              <div className="border-muted bg-muted/30 flex min-h-0 flex-1 flex-col gap-2 rounded-lg border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium" title={docPreview.name}>
                    {docPreview.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    onClick={clearDocPreview}
                  >
                    미리보기 닫기
                  </Button>
                </div>
                {docPreview.kind === "pdf" ? (
                  <iframe
                    title="PDF 미리보기"
                    src={docPreview.url}
                    className="bg-background h-[min(52vh,420px)] w-full shrink-0 rounded-md border"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- blob URL 로컬 미리보기
                  <img
                    src={docPreview.url}
                    alt=""
                    className="mx-auto max-h-[min(52vh,420px)] w-full object-contain"
                  />
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center text-[11px]">
                목록에서 「미리보기」를 누르면 이 영역에 표시됩니다.
              </p>
            )}
          </div>
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={docSaving}
              onClick={() => {
                clearDocPreview();
                setDocOrderId(null);
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={
                docSaving ||
                docOrderId === null ||
                (attachmentsByOrder[docOrderId]?.length ?? 0) === 0
              }
              onClick={() => void saveOrderDocuments()}
            >
              {docSaving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
