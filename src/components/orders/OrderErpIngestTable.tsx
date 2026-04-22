"use client";

/**
 * ERP 적재 미리보기 표 — OrdersTable과 동일한 열 구성·정렬·통화 표시
 * 변경 이유: 주문 표와 시각·UX 통일
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import type { ErpMenu, ErpRow } from "./_hooks/useErpData";
import { FileIcon, Eye } from "lucide-react";
import { toast } from "sonner";

/** 서버에 저장된 서류(API GET 응답) — 변경 이유: OrdersTable과 동일 계약 서류 조회 */
type PersistedOrderDocument = {
  id: string;
  file_name: string;
  created_at?: string;
  signed_url: string | null;
};

/** 숫자 파싱 — 실패 시 null */
function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** yyyy-mm-dd 표시 */
function formatContractDate(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.trim() || "—";
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR");
}

/** 단가(통화) — 변경 이유: OrdersTable과 동일하게 KRW 표기 */
function formatCurrencyKRW(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(v);
}

/** 행별 계약 수량(ERP 기준) */
function contractQtyForMenu(menu: ErpMenu, row: ErpRow): number | null {
  if (menu === "stock_ledger") {
    return parseNum(row.inbound_qty);
  }
  return parseNum(row.qty);
}

function rowStableKey(menu: ErpMenu, row: ErpRow, idx: number): string {
  const id = row["id"];
  if (typeof id === "number" || typeof id === "string") {
    return `${menu}-${String(id)}`;
  }
  return `${menu}-${idx}-${String(row.doc_date ?? "")}-${String(row.erp_code ?? "")}-${String(row.counterparty ?? "")}-${String(row.memo ?? "")}`;
}

function docPreviewKind(file: File): "pdf" | "image" | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name)) return "image";
  return null;
}

/** ERP 행의 orders.id 연결값 — 변경 이유: order_documents는 주문 FK만 저장 가능 */
function orderIdFromErpRow(row: ErpRow): number | null {
  const v = row["order_id"];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

export interface OrderErpIngestTableProps {
  menu: ErpMenu;
  rows: ErpRow[];
  loading: boolean;
  emptyMessage: string;
}

export function OrderErpIngestTable({
  menu,
  rows,
  loading,
  emptyMessage,
}: OrderErpIngestTableProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [attachmentsByKey, setAttachmentsByKey] = useState<Record<string, File[]>>({});
  const [docDialogKey, setDocDialogKey] = useState<string | null>(null);
  const [persistedDocs, setPersistedDocs] = useState<PersistedOrderDocument[]>([]);
  const [docListLoading, setDocListLoading] = useState(false);
  const [docSaving, setDocSaving] = useState(false);
  /** 네이티브 file 인풋 숨김 후 버튼으로만 열기 — 변경 이유: 'No file chosen' 노출 방지 */
  const erpDocFileInputRef = useRef<HTMLInputElement>(null);
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
  }, [docDialogKey, clearDocPreview]);

  const docDialogRowIndex = useMemo(() => {
    if (!docDialogKey) return -1;
    return rows.findIndex((row, idx) => rowStableKey(menu, row, idx) === docDialogKey);
  }, [docDialogKey, rows, menu]);

  const docLinkedOrderId =
    docDialogRowIndex >= 0 ? orderIdFromErpRow(rows[docDialogRowIndex]) : null;

  useEffect(() => {
    if (docLinkedOrderId === null) {
      setPersistedDocs([]);
      return;
    }
    let cancelled = false;
    setDocListLoading(true);
    void fetch(`/api/orders/order-documents?orderId=${docLinkedOrderId}`)
      .then((res) => res.json())
      .then((body: { documents?: PersistedOrderDocument[] }) => {
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
  }, [docLinkedOrderId]);

  const saveErpRowDocuments = useCallback(async () => {
    if (docDialogKey === null || docLinkedOrderId === null) return;
    const files = attachmentsByKey[docDialogKey] ?? [];
    if (files.length === 0) {
      toast.error("저장할 새 파일을 먼저 추가해 주세요.");
      return;
    }
    setDocSaving(true);
    try {
      const form = new FormData();
      form.append("orderId", String(docLinkedOrderId));
      for (const f of files) {
        form.append("files", f);
      }
      const res = await fetch("/api/orders/order-documents", { method: "POST", body: form });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? "저장에 실패했습니다.");
      toast.success("서류가 해당 계약(주문)에 저장되었습니다.");
      setAttachmentsByKey((prev) => ({ ...prev, [docDialogKey]: [] }));
      const listRes = await fetch(`/api/orders/order-documents?orderId=${docLinkedOrderId}`);
      const listBody = (await listRes.json()) as { documents?: PersistedOrderDocument[] };
      if (listRes.ok && Array.isArray(listBody.documents)) {
        setPersistedDocs(listBody.documents);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setDocSaving(false);
    }
  }, [docDialogKey, docLinkedOrderId, attachmentsByKey]);

  const rowKeys = useMemo(() => rows.map((row, idx) => rowStableKey(menu, row, idx)), [rows, menu]);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      const next: Record<string, boolean> = {};
      rowKeys.forEach((k) => {
        next[k] = checked;
      });
      setSelected(next);
    },
    [rowKeys]
  );

  const allSelected = rowKeys.length > 0 && rowKeys.every((k) => selected[k]);
  const someSelected = rowKeys.some((k) => selected[k]);

  if (loading) return <LoadingSpinner />;

  if (!rows.length) return <EmptyState message={emptyMessage} />;

  const docKey = docDialogKey;
  const dialogFiles = docKey ? (attachmentsByKey[docKey] ?? []) : [];

  const stickyBg = "bg-background";
  const stickyHead = `${stickyBg} backdrop-blur-sm`;

  /** 적재 미리보기는 아직 orders 미연동 → 승인대기 톤으로 통일 — 변경 이유: OrdersTable pending 배지와 동일 스타일 */
  const previewStatusBadge = {
    label: "승인대기" as const,
    variant: "outline" as const,
    className: "border-amber-400/80 text-amber-800 dark:text-amber-200",
  };

  return (
    <>
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
                      onCheckedChange={(c) => toggleSelectAll(Boolean(c))}
                      aria-label="현재 목록 전체 선택"
                    />
                  </div>
                </TableHead>
                <TableHead
                  className={`border-border sticky left-10 z-40 min-w-[88px] border-r ${stickyHead} text-center`}
                >
                  상태
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap">
                  계약일
                </TableHead>
                <TableHead
                  className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap"
                  title="erp_code · 품목명"
                >
                  품목코드 및 품목명
                </TableHead>
                <TableHead
                  className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap"
                  title="수량"
                >
                  수량
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap">
                  단가(통화)
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap">
                  공급가액
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap">
                  부가세
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap">
                  합계
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[100px] text-center text-xs whitespace-nowrap">
                  거래처명
                </TableHead>
                <TableHead className="bg-muted/60 min-w-[88px] text-center text-xs whitespace-nowrap">
                  서류
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => {
                const rk = rowStableKey(menu, row, idx);
                const cq = contractQtyForMenu(menu, row);
                const code =
                  row.erp_code !== null &&
                  row.erp_code !== undefined &&
                  String(row.erp_code).trim() !== ""
                    ? String(row.erp_code).trim()
                    : "—";
                const nameLine =
                  menu === "stock_ledger"
                    ? String(row.memo ?? row.counterparty ?? "—")
                    : String(row.product_name ?? "—");

                return (
                  <TableRow key={rk}>
                    <TableCell
                      className={`border-border sticky left-0 z-30 min-w-10 border-r ${stickyBg} text-center align-middle`}
                    >
                      <div className="flex justify-center">
                        <Checkbox
                          checked={Boolean(selected[rk])}
                          onCheckedChange={(c) =>
                            setSelected((prev) => ({ ...prev, [rk]: Boolean(c) }))
                          }
                          aria-label={`행 선택 ${idx + 1}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell
                      className={`border-border sticky left-10 z-30 min-w-[88px] border-r ${stickyBg} text-center align-middle`}
                    >
                      <div className="flex justify-center">
                        <Badge
                          variant={previewStatusBadge.variant}
                          className={previewStatusBadge.className}
                        >
                          {previewStatusBadge.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">
                      {formatContractDate(row.doc_date)}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-center">
                      <div className="flex flex-col items-center gap-0.5 text-center">
                        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                          {code}
                        </span>
                        <span className="line-clamp-2 text-xs">{nameLine}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">
                      {formatNumber(cq)}
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">
                      {menu === "stock_ledger" ? "—" : formatCurrencyKRW(parseNum(row.unit_price))}
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">
                      {menu === "stock_ledger" ? "—" : formatNumber(parseNum(row.supply_amount))}
                    </TableCell>
                    <TableCell className="text-center text-xs tabular-nums">
                      {menu === "stock_ledger" ? "—" : formatNumber(parseNum(row.vat_amount))}
                    </TableCell>
                    <TableCell className="text-center text-xs font-medium tabular-nums">
                      {menu === "stock_ledger" ? "—" : formatNumber(parseNum(row.total_amount))}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-center text-xs">
                      {String(row.counterparty ?? "—")}
                    </TableCell>
                    <TableCell className="text-center align-middle text-xs">
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs"
                          onClick={() => setDocDialogKey(rk)}
                        >
                          서류
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={docKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            clearDocPreview();
            setDocDialogKey(null);
          }
        }}
      >
        <DialogContent showCloseButton className="flex max-h-[90vh] flex-col gap-4 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>서류</DialogTitle>
            <DialogDescription className={docLinkedOrderId !== null ? undefined : "sr-only"}>
              {docLinkedOrderId !== null ? (
                <>
                  주문 ID {docLinkedOrderId} 계약에 「저장」 시 Supabase에 보관되며, 다른 세션에서도
                  같은 목록으로 조회할 수 있습니다.
                </>
              ) : (
                "계약 관련 서류를 첨부하고 미리볼 수 있습니다."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {docLinkedOrderId !== null ? (
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
            ) : null}

            <div className="flex flex-col gap-2 text-xs">
              <input
                ref={erpDocFileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf"
                tabIndex={-1}
                className="sr-only"
                onChange={(e) => {
                  if (!docKey) return;
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  if (!files.length) return;
                  setAttachmentsByKey((prev) => ({
                    ...prev,
                    [docKey]: [...(prev[docKey] ?? []), ...files],
                  }));
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => erpDocFileInputRef.current?.click()}
                >
                  첨부하기
                </Button>
                {docLinkedOrderId !== null ? (
                  <span className="text-muted-foreground text-[11px]">
                    추가한 파일은 「저장」 시 서버에 업로드됩니다.
                  </span>
                ) : null}
              </div>
            </div>

            <ul className="border-border max-h-36 shrink-0 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
              {dialogFiles.length === 0 ? (
                <li className="text-muted-foreground py-4 text-center">
                  {docLinkedOrderId !== null
                    ? "추가한 새 파일이 없습니다. 업로드 후 「저장」을 누르세요."
                    : "첨부된 파일이 없습니다."}
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
                setDocDialogKey(null);
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={
                docSaving ||
                docLinkedOrderId === null ||
                docDialogKey === null ||
                (attachmentsByKey[docDialogKey]?.length ?? 0) === 0
              }
              onClick={() => void saveErpRowDocuments()}
            >
              {docSaving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
