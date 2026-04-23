"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/lib/supabase/types";
import type { OrderDashboardRow } from "./_hooks/useOrders";
import { parseDashboardMemo, type DashboardMemoOverlay } from "@/lib/orders/orderDashMemo";
import { OrdersRejectPopover } from "./OrdersRejectPopover";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type CurrentStockRow = Pick<
  Tables<"v_current_stock">,
  | "item_id"
  | "seq_no"
  | "item_name_raw"
  | "item_name_norm"
  | "category"
  | "current_stock"
  | "base_stock_qty"
  | "base_date"
  | "last_movement_date"
  | "last_movement_type"
>;

interface Props {
  itemId: number | null;
  /** 테이블에서 선택한 행 — 계약 상세·입력·승인용 */
  orderRow: OrderDashboardRow | null;
  /** 메모 저장·승인 후 목록 재조회 */
  onOrderUpdated: () => void;
  /** 다이얼로그가 닫힐 때(사용자 액션) — 선택 상태 해제 */
  onClose?: () => void;
}

/** 표시용 연도 (예: 26년) */
function yearShortLabel(year: number): string {
  return `${String(year).slice(-2)}년`;
}

/** 오버레이 또는 재고수불 기준 실입고 */
function effectiveReceivedQty(r: OrderDashboardRow, o: DashboardMemoOverlay): number {
  if (o.rq !== undefined) return o.rq;
  if (r.stock_movement_id != null && r.quantity_delta != null) {
    return Math.abs(Number(r.quantity_delta));
  }
  return 0;
}

/** 송금액 표시 — 오버레이 우선 */
function effectiveRemittance(r: OrderDashboardRow, o: DashboardMemoOverlay): number {
  if (o.rm !== undefined) return o.rm;
  const t = r.total_amount;
  return t !== null && t !== undefined && Number.isFinite(Number(t)) ? Number(t) : 0;
}

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ko-KR");
}

/** 입력 문자열을 숫자로 — 빈 문자열은 null */
function parseNumericInput(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 계약 수량 반올림 — 변경 이유: 금액→수량 역산 시 표시 안정화 */
function roundContractQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 원화 단위 반올림 — 변경 이유: 수량→금액 역산 시 표시 안정화 */
function roundContractKrw(n: number): number {
  return Math.round(n * 100) / 100;
}

type PhaseBadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** 누적 실입고·계약수량 기준 단계 — 변경 이유: 주문 표 배지와 동일(승인대기→승인진행→승인완료) */
function qtyApprovalPhaseBadge(
  status: string | null | undefined,
  cumulativeRq: number,
  contractQty: number
): { label: string; variant: PhaseBadgeVariant; className?: string } {
  if (status === "approved") return { label: "승인완료", variant: "default" };
  if (status === "rejected") return { label: "승인취소", variant: "destructive" };
  if (contractQty <= 0) {
    return {
      label: "승인대기",
      variant: "outline",
      className: "border-amber-400/80 text-amber-800 dark:text-amber-200",
    };
  }
  const ratio = cumulativeRq / contractQty;
  if (ratio >= 1 - 1e-9) return { label: "승인완료", variant: "default" };
  if (ratio > 1e-9) {
    return {
      label: "승인진행",
      variant: "outline",
      className: "border-sky-500/70 text-sky-900 dark:text-sky-100",
    };
  }
  return {
    label: "승인대기",
    variant: "outline",
    className: "border-amber-400/80 text-amber-800 dark:text-amber-200",
  };
}

/** 계약금액 표시 — DB에 통화 컬럼 없음 → KRW 고정 */
function formatContractAmountKrw(total: number | null | undefined): string {
  if (total === null || total === undefined) return "—";
  const v = Number(total);
  if (!Number.isFinite(v)) return "—";
  return `KRW ${v.toLocaleString("ko-KR")}`;
}

/** 이행률(%) — 분모 0이면 null */
function fulfillmentPercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

async function postOverlay(
  orderId: number,
  patch: Record<string, string | number | undefined>
): Promise<{ ok: boolean; autoApproved?: boolean }> {
  try {
    const res = await fetch("/api/orders/update-dashboard-overlay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, ...patch }),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { autoApproved?: boolean };
    return { ok: true, autoApproved: Boolean(body.autoApproved) };
  } catch {
    return { ok: false };
  }
}

/** 가로 배치용 상세 항목 블록 */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

/** 선택 품목 재고 + 선택 행 계약 상세 — 다이얼로그 팝업 */
export function OrdersStockSidebar({ itemId, orderRow, onOrderUpdated, onClose }: Props) {
  const [row, setRow] = useState<CurrentStockRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const overlay = useMemo(() => parseDashboardMemo(orderRow?.memo ?? null), [orderRow?.memo]);

  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2];
  }, [now]);

  const [mfgY, setMfgY] = useState<number>(() => overlay.mfy ?? now.getFullYear());

  useEffect(() => {
    const o = parseDashboardMemo(orderRow?.memo ?? null);
    setMfgY(o.mfy ?? now.getFullYear());
  }, [orderRow?.order_id, orderRow?.memo, now]);

  /** 실입고·실송금 입력 초기 동기화(이행률·저장과 공유) */
  const [rqDraft, setRqDraft] = useState("");
  const [rmDraft, setRmDraft] = useState("");

  useEffect(() => {
    if (!orderRow) return;
    const o = parseDashboardMemo(orderRow.memo ?? null);
    const rq = effectiveReceivedQty(orderRow, o);
    const rm = effectiveRemittance(orderRow, o);
    setRqDraft(rq === 0 && o.rq === undefined ? "" : String(rq));
    setRmDraft(rm === 0 && o.rm === undefined ? "" : String(rm));
  }, [orderRow?.order_id, orderRow?.memo]);

  const persistMfgYear = useCallback(
    (nextY: number) => {
      setMfgY(nextY);
      const orderId = orderRow?.order_id;
      if (orderId === null || orderId === undefined) return;
      void (async () => {
        const result = await postOverlay(orderId, { mfgYear: nextY });
        if (result.ok) onOrderUpdated();
      })();
    },
    [orderRow?.order_id, onOrderUpdated]
  );

  useEffect(() => {
    if (itemId === null) {
      setRow(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error: err } = await supabase
        .from("v_current_stock")
        .select(
          "item_id, seq_no, item_name_raw, item_name_norm, category, current_stock, base_stock_qty, base_date, last_movement_date, last_movement_type"
        )
        .eq("item_id", itemId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRow(null);
      } else {
        setRow(data as CurrentStockRow | null);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, supabase]);

  const callApprove = useCallback(
    async (action: "approve" | "unapprove") => {
      if (orderRow?.order_id === null || orderRow?.order_id === undefined) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/orders/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: [orderRow.order_id], action }),
        });
        if (res.ok) onOrderUpdated();
      } finally {
        setSubmitting(false);
      }
    },
    [orderRow?.order_id, onOrderUpdated]
  );

  /** 선택 행 기준 이행률 계산 — 실입고·실송금 초안 문자열 반영 */
  const fulfillmentPct = useMemo(() => {
    if (!orderRow) {
      return { qty: null as number | null, amt: null as number | null };
    }
    const parsedRq = parseNumericInput(rqDraft) ?? 0;
    const parsedRm = parseNumericInput(rmDraft) ?? 0;
    const cq = Number(orderRow.quantity ?? 0);
    const ca = Number(orderRow.total_amount ?? 0);
    return {
      qty: fulfillmentPercent(parsedRq, cq),
      amt: fulfillmentPercent(parsedRm, ca),
    };
  }, [orderRow, rqDraft, rmDraft]);

  /** 계약 수량·금액 모두 유효할 때 하나의 이행률 % (두 축 중 높은 쪽) — 변경 이유: 수량·금액 연동 조회 */
  const fulfillmentUnifiedPct = useMemo(() => {
    if (!orderRow) return null;
    const cq = Number(orderRow.quantity ?? 0);
    const ca =
      orderRow.total_amount !== null && orderRow.total_amount !== undefined
        ? Number(orderRow.total_amount)
        : 0;
    if (!(cq > 0 && ca > 0)) return null;
    const parsedRq = parseNumericInput(rqDraft) ?? 0;
    const parsedRm = parseNumericInput(rmDraft) ?? 0;
    const pq = fulfillmentPercent(parsedRq, cq);
    const pa = fulfillmentPercent(parsedRm, ca);
    if (pq === null && pa === null) return null;
    const vals = [pq, pa].filter((v): v is number => v !== null);
    return Math.min(100, Math.max(...vals));
  }, [orderRow, rqDraft, rmDraft]);

  /** 입력 중 초안 우선 — 변경 이유: 실입고(누적)/계약 표시와 배지가 즉시 반영되게 함 */
  const receivedCumulativeLive = useMemo(() => {
    const d = parseNumericInput(rqDraft);
    if (d !== null) return d;
    if (!orderRow) return 0;
    return effectiveReceivedQty(orderRow, overlay);
  }, [rqDraft, orderRow, overlay]);

  const qtyPhaseDisp = useMemo(() => {
    if (!orderRow) {
      return { label: "—", variant: "outline" as PhaseBadgeVariant };
    }
    const cq = Number(orderRow.quantity ?? 0);
    return qtyApprovalPhaseBadge(orderRow.status, receivedCumulativeLive, cq);
  }, [orderRow, receivedCumulativeLive]);

  const remainingQtyLive = useMemo(() => {
    if (!orderRow) return 0;
    const cq = Number(orderRow.quantity ?? 0);
    const remain = cq - receivedCumulativeLive;
    return remain > 0 ? remain : 0;
  }, [orderRow, receivedCumulativeLive]);

  // 다이얼로그 열림 여부 — 행을 선택했을 때만 열림
  const open = orderRow !== null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose?.();
  };

  const oid = orderRow?.order_id;
  const contractQty = Number(orderRow?.quantity ?? 0);
  const contractAmt =
    orderRow?.total_amount !== null && orderRow?.total_amount !== undefined
      ? Number(orderRow.total_amount)
      : 0;
  /** 계약 수량·합계금액이 모두 있을 때만 수량↔금액 연동 — 변경 이유: 이행률 축 단일화 */
  const linkedContract = contractQty > 0 && contractAmt > 0;

  const itemDisplayName =
    row?.item_name_norm ?? row?.item_name_raw ?? (itemId !== null ? `item_id:${itemId}` : "—");
  const current = row?.current_stock ?? 0;
  const base = row?.base_stock_qty ?? 0;
  const delta = current - base;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">재고 승인 여부 결정하기</DialogTitle>
          {row ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">
                #{row.seq_no} · {itemDisplayName}
              </p>
              {row.category ? (
                <Badge variant="outline" className="text-xs">
                  {row.category}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error ? (
          <p className="text-destructive text-sm">조회 실패: {error}</p>
        ) : orderRow && oid !== null && oid !== undefined ? (
          <div className="space-y-5">
            {/* 계약 상세 — 가로 4열 */}
            <section className="border-border border-t pt-4">
              <p className="mb-3 text-sm font-semibold">계약 상세</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
                <DetailItem label="계약일" value={orderRow.tx_date?.slice(0, 10) ?? "—"} />
                <DetailItem label="ERP코드" value={orderRow.erp_code ?? "—"} />
                <DetailItem
                  label="품목"
                  value={orderRow.item_name ?? orderRow.erp_item_name_raw ?? "—"}
                />
                <DetailItem label="거래처" value={orderRow.counterparty ?? "—"} />
              </div>
            </section>

            {/* 제조년도 · 수량 · 합계 — 명시적 그리드 행으로 행간 정렬 통일
                행 1: 라벨(+배지)  /  행 2: 서브정보  /  행 3: 입력 2열  /  행 4: 이행률 */}
            <section className="border-border grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-4 md:grid-cols-3">
              {/* Row 1 — 라벨 */}
              <div className="flex h-6 items-center">
                <Label className="text-sm font-semibold">제조년도</Label>
              </div>
              <div className="flex h-6 items-center justify-between">
                <Label className="text-sm font-semibold">수량</Label>
                <Badge
                  variant={qtyPhaseDisp.variant}
                  className={
                    qtyPhaseDisp.className ? `text-[10px] ${qtyPhaseDisp.className}` : "text-[10px]"
                  }
                >
                  {qtyPhaseDisp.label}
                </Badge>
              </div>
              <div className="flex h-6 items-center">
                <Label className="text-sm font-semibold">합계</Label>
              </div>

              {/* Row 2 — 서브 정보(수량만 실데이터, 나머지는 높이 맞춤용 빈 슬롯) */}
              <div aria-hidden className="text-xs">
                &nbsp;
              </div>
              <p className="text-muted-foreground text-xs tabular-nums">
                실입고(누적){" "}
                <span className="text-foreground font-medium">
                  {formatNum(receivedCumulativeLive)}
                </span>
                <span className="text-muted-foreground mx-1">/</span>
                계약수량{" "}
                <span className="text-foreground font-medium">{formatNum(contractQty)}</span>
              </p>
              <div aria-hidden className="text-xs">
                &nbsp;
              </div>

              {/* Row 3 — 입력(제조년도: Select 단일 / 수량·합계: 입력 2열) */}
              <Select value={String(mfgY)} onValueChange={(v) => persistMfgYear(Number(v))}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {yearShortLabel(y)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  className="h-9 flex-1 text-right text-sm tabular-nums"
                  placeholder="누적 실입고 수량"
                  value={rqDraft}
                  onChange={(e) => setRqDraft(e.target.value)}
                  aria-label="누적 실입고 수량"
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/,/g, "").trim();
                    const n = raw === "" ? 0 : Number(raw);
                    if (!Number.isFinite(n)) return;
                    void (async () => {
                      const nextRq = Math.max(0, n);
                      let nextRm = parseNumericInput(rmDraft) ?? 0;
                      if (linkedContract) {
                        nextRm = roundContractKrw((nextRq / contractQty) * contractAmt);
                        setRmDraft(nextRm === 0 ? "" : String(nextRm));
                      }
                      const patch: Record<string, number | undefined> = { receivedQty: nextRq };
                      if (linkedContract) patch.remittanceAmount = nextRm;
                      const result = await postOverlay(oid, patch);
                      if (result.ok) {
                        if (result.autoApproved) {
                          toast.success("계약 이행이 완료되어 승인완료 처리되었습니다.");
                        }
                        onOrderUpdated();
                      }
                    })();
                  }}
                />
                {/* 남은 수량 표시 — 계약 대비 잔여 */}
                <Input
                  readOnly
                  disabled
                  className="bg-muted h-9 flex-1 text-right text-sm tabular-nums"
                  value={formatNum(remainingQtyLive)}
                  aria-label="남은 수량"
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-9 flex-1 text-right text-sm tabular-nums"
                  placeholder="실송금액"
                  value={rmDraft}
                  onChange={(e) => setRmDraft(e.target.value)}
                  aria-label="실송금액"
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/,/g, "").trim();
                    const n = raw === "" ? 0 : Number(raw);
                    if (!Number.isFinite(n)) return;
                    void (async () => {
                      const nextRm = Math.max(0, n);
                      let nextRq = parseNumericInput(rmDraft) ?? 0;
                      if (linkedContract) {
                        nextRq = roundContractQty((nextRm / contractAmt) * contractQty);
                        setRqDraft(nextRq === 0 ? "" : String(nextRq));
                      }
                      const patch: Record<string, number | undefined> = {
                        remittanceAmount: nextRm,
                      };
                      if (linkedContract) patch.receivedQty = nextRq;
                      const result = await postOverlay(oid, patch);
                      if (result.ok) {
                        if (result.autoApproved) {
                          toast.success("계약 이행이 완료되어 승인완료 처리되었습니다.");
                        }
                        onOrderUpdated();
                      }
                    })();
                  }}
                />
                <Input
                  readOnly
                  disabled
                  className="bg-muted h-9 flex-1 text-right text-sm tabular-nums"
                  value={formatContractAmountKrw(orderRow.total_amount)}
                  aria-label="계약금액(KRW)"
                />
              </div>

              {/* Row 4 — 이행률(제조년도 열은 빈 슬롯) */}
              <div aria-hidden className="min-h-[36px]">
                &nbsp;
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground flex justify-between text-[11px]">
                  <span>수량 이행률</span>
                  <span className="tabular-nums">
                    {fulfillmentPct.qty !== null
                      ? `${fulfillmentPct.qty >= 100 ? fulfillmentPct.qty.toFixed(0) : fulfillmentPct.qty.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <Progress
                  value={fulfillmentPct.qty !== null ? Math.min(100, fulfillmentPct.qty) : 0}
                  aria-label="계약 수량 대비 실입고 비율"
                />
              </div>
              <div className="space-y-1">
                {linkedContract ? (
                  <>
                    <div className="text-muted-foreground flex justify-between text-[11px]">
                      <span>계약 이행률</span>
                      <span className="tabular-nums">
                        {fulfillmentUnifiedPct !== null
                          ? `${fulfillmentUnifiedPct >= 100 ? fulfillmentUnifiedPct.toFixed(0) : fulfillmentUnifiedPct.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                    <Progress
                      value={
                        fulfillmentUnifiedPct !== null ? Math.min(100, fulfillmentUnifiedPct) : 0
                      }
                      aria-label="계약 수량·금액 대비 실적 이행 비율"
                    />
                  </>
                ) : (
                  <>
                    <div className="text-muted-foreground flex justify-between text-[11px]">
                      <span>금액 이행률</span>
                      <span className="tabular-nums">
                        {fulfillmentPct.amt !== null
                          ? `${fulfillmentPct.amt >= 100 ? fulfillmentPct.amt.toFixed(0) : fulfillmentPct.amt.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                    <Progress
                      value={fulfillmentPct.amt !== null ? Math.min(100, fulfillmentPct.amt) : 0}
                      aria-label="계약 합계 대비 실송금 비율"
                    />
                  </>
                )}
              </div>
            </section>

            {/* 현재 재고 정보 — 계약 상세와 동일한 DetailItem 스타일 */}
            {row ? (
              <section className="border-border grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-4 md:grid-cols-4">
                <DetailItem label="현재 수량" value={current.toLocaleString("ko-KR")} />
                <DetailItem
                  label="기준 재고"
                  value={`${base.toLocaleString("ko-KR")}${row.base_date ? ` (${row.base_date})` : ""}`}
                />
                <DetailItem
                  label="누적 변동"
                  value={`${delta >= 0 ? "+" : ""}${delta.toLocaleString("ko-KR")}`}
                />
                <DetailItem
                  label="최근 변동"
                  value={
                    row.last_movement_date
                      ? `${row.last_movement_date} · ${row.last_movement_type ?? "—"}`
                      : "이력 없음"
                  }
                />
              </section>
            ) : null}

            {/* 승인/취소 액션 — 버튼 크기/위치 통일 */}
            <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-9 min-w-[80px] px-5 text-sm"
                disabled={submitting || orderRow.status !== "pending" || orderRow.order_id === null}
                onClick={() => void callApprove("approve")}
              >
                승인
              </Button>
              {orderRow.status === "approved" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-9 min-w-[80px] px-5 text-sm"
                  disabled={submitting}
                  onClick={() => void callApprove("unapprove")}
                >
                  취소
                </Button>
              ) : orderRow.status === "pending" ? (
                <OrdersRejectPopover
                  orderIds={[oid]}
                  triggerLabel="취소"
                  triggerClassName="h-9 min-w-[80px] px-5 text-sm"
                  onDone={onOrderUpdated}
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-9 min-w-[80px] px-5 text-sm"
                  disabled
                >
                  취소
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">테이블에서 거래 행을 눌러 주세요.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
