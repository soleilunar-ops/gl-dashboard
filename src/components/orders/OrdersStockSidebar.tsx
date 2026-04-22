"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** 선택 품목 재고 + 선택 행 계약 상세 */
export function OrdersStockSidebar({ itemId, orderRow, onOrderUpdated }: Props) {
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
  const [exchangeRateCnyKrw, setExchangeRateCnyKrw] = useState<number | null>(null);
  const [exchangeRateUsdKrw, setExchangeRateUsdKrw] = useState<number | null>(null);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderRow) return;
    const o = parseDashboardMemo(orderRow.memo ?? null);
    const rq = effectiveReceivedQty(orderRow, o);
    const rm = effectiveRemittance(orderRow, o);
    setRqDraft(rq === 0 && o.rq === undefined ? "" : String(rq));
    setRmDraft(rm === 0 && o.rm === undefined ? "" : String(rm));
  }, [orderRow?.order_id, orderRow?.memo]);

  /** 거래 행 바뀔 때만 환율 조회 에러 초기화(표시값은 유지) */
  useEffect(() => {
    setExchangeError(null);
  }, [orderRow?.order_id]);

  const fetchFxRates = useCallback(async () => {
    setExchangeLoading(true);
    setExchangeError(null);
    try {
      const [usdRes, cnyRes] = await Promise.all([
        fetch("/api/exchange-rate?from=USD&to=KRW"),
        fetch("/api/exchange-rate?from=CNY&to=KRW"),
      ]);
      const usdData = (await usdRes.json()) as { rate?: number; error?: string };
      const cnyData = (await cnyRes.json()) as { rate?: number; error?: string };
      if (
        !usdRes.ok ||
        !cnyRes.ok ||
        typeof usdData.rate !== "number" ||
        typeof cnyData.rate !== "number"
      ) {
        setExchangeRateUsdKrw(null);
        setExchangeRateCnyKrw(null);
        setExchangeError(
          usdData.error ?? cnyData.error ?? "실시간 환율(CNY/USD)을 불러오지 못했습니다."
        );
        return;
      }
      setExchangeRateUsdKrw(usdData.rate);
      setExchangeRateCnyKrw(cnyData.rate);
    } catch {
      setExchangeRateUsdKrw(null);
      setExchangeRateCnyKrw(null);
      setExchangeError("실시간 환율(CNY/USD)을 불러오지 못했습니다.");
    } finally {
      setExchangeLoading(false);
    }
  }, []);

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

  if (itemId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">재고 승인 여부 결정하기</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">품목 행을 선택하세요.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">재고 승인 여부 결정하기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">재고 승인 여부 결정하기</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">조회 실패: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!row) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">재고 승인 여부 결정하기</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">품목 정보 없음</p>
        </CardContent>
      </Card>
    );
  }

  const current = row.current_stock ?? 0;
  const base = row.base_stock_qty ?? 0;
  const delta = current - base;
  const name = row.item_name_norm ?? row.item_name_raw ?? `item_id:${row.item_id}`;
  const oid = orderRow?.order_id;
  const contractQty = Number(orderRow?.quantity ?? 0);
  const contractAmt =
    orderRow?.total_amount !== null && orderRow?.total_amount !== undefined
      ? Number(orderRow.total_amount)
      : 0;
  /** 계약 수량·합계금액이 모두 있을 때만 수량↔금액 연동 — 변경 이유: 이행률 축 단일화 */
  const linkedContract = contractQty > 0 && contractAmt > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">재고 승인 여부 결정하기</CardTitle>
        <p className="text-muted-foreground text-xs">
          #{row.seq_no} · {name}
        </p>
        {row.category ? (
          <Badge variant="outline" className="mt-1 w-fit text-xs">
            {row.category}
          </Badge>
        ) : null}
      </CardHeader>

      {orderRow && oid !== null && oid !== undefined ? (
        <CardContent className="border-border space-y-3 border-t pt-3">
          <p className="text-xs font-medium">계약 상세</p>
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              <span className="text-foreground font-medium">계약일</span>{" "}
              {orderRow.tx_date?.slice(0, 10) ?? "—"}
            </p>
            <p>
              <span className="text-foreground font-medium">ERP코드</span>{" "}
              {orderRow.erp_code ?? "—"}
            </p>
            <p className="line-clamp-3">
              <span className="text-foreground font-medium">품목</span>{" "}
              {orderRow.item_name ?? orderRow.erp_item_name_raw ?? "—"}
            </p>
            <p className="line-clamp-2">
              <span className="text-foreground font-medium">거래처</span>{" "}
              {orderRow.counterparty ?? "—"}
            </p>
            {linkedContract ? (
              <p className="text-muted-foreground pt-1 text-[11px] leading-relaxed">
                실입고·실송금은 동일 이행률로 연동 저장됩니다. 입력 후 포커스가 벗어날 때 계약별
                이행률이 함께 저장됩니다.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">제조년도</Label>
            <div className="flex flex-wrap gap-2">
              <Select value={String(mfgY)} onValueChange={(v) => persistMfgYear(Number(v))}>
                <SelectTrigger className="h-8 w-[88px] text-xs">
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
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs">수량</Label>
              <Badge
                variant={qtyPhaseDisp.variant}
                className={
                  qtyPhaseDisp.className ? `text-[10px] ${qtyPhaseDisp.className}` : "text-[10px]"
                }
              >
                {qtyPhaseDisp.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs tabular-nums">
              실입고(누적){" "}
              <span className="text-foreground font-medium">
                {formatNum(receivedCumulativeLive)}
              </span>
              <span className="text-muted-foreground mx-1">/</span>
              계약수량 <span className="text-foreground font-medium">{formatNum(contractQty)}</span>
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                className="h-8 flex-1 text-right text-xs tabular-nums"
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
              {/* 남은 수량 표시 — 변경 이유: 계약 대비 잔여 수량을 우측 비활성 숫자로 즉시 확인 */}
              <Input
                readOnly
                disabled
                className="bg-muted h-8 w-[170px] text-right text-xs tabular-nums"
                value={formatNum(remainingQtyLive)}
                aria-label="남은 수량"
              />
            </div>
            {!linkedContract ? (
              <div className="space-y-1 pt-0.5">
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
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">합계</Label>
            <Input
              type="text"
              inputMode="decimal"
              className="h-8 text-right text-xs tabular-nums"
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
                  let nextRq = parseNumericInput(rqDraft) ?? 0;
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
              className="bg-muted h-8 text-right text-xs tabular-nums"
              value={formatContractAmountKrw(orderRow.total_amount)}
              aria-label="계약금액(KRW)"
            />
            {!linkedContract ? (
              <div className="space-y-1 pt-0.5">
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
              </div>
            ) : (
              <div className="space-y-1 pt-0.5">
                <div className="text-muted-foreground flex justify-between text-[11px]">
                  <span>계약 이행률 (수량·금액 동일 비율)</span>
                  <span className="tabular-nums">
                    {fulfillmentUnifiedPct !== null
                      ? `${fulfillmentUnifiedPct >= 100 ? fulfillmentUnifiedPct.toFixed(0) : fulfillmentUnifiedPct.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <Progress
                  value={fulfillmentUnifiedPct !== null ? Math.min(100, fulfillmentUnifiedPct) : 0}
                  aria-label="계약 수량·금액 대비 실적 이행 비율"
                />
              </div>
            )}

            <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-[11px]">현재 환율 (USD/KRW 참고)</p>
                <p className="text-foreground font-medium tabular-nums">
                  {exchangeLoading ? (
                    <span className="text-muted-foreground text-xs">조회 중…</span>
                  ) : exchangeRateUsdKrw !== null && exchangeRateCnyKrw !== null ? (
                    <>
                      1 CNY ={" "}
                      {exchangeRateCnyKrw.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} KRW
                      <br />1 USD ={" "}
                      {exchangeRateUsdKrw.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} KRW
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">버튼으로 조회하세요.</span>
                  )}
                </p>
                {exchangeError ? (
                  <p className="text-destructive pt-0.5 text-[10px]">{exchangeError}</p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={exchangeLoading}
                onClick={() => void fetchFxRates()}
              >
                실시간 환율 조회
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={submitting || orderRow.status !== "pending" || orderRow.order_id === null}
              onClick={() => void callApprove("approve")}
            >
              승인
            </Button>
            {orderRow.status === "approved" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => void callApprove("unapprove")}
              >
                취소
              </Button>
            ) : orderRow.status === "pending" ? (
              <OrdersRejectPopover
                orderIds={[oid]}
                triggerLabel="취소"
                triggerClassName="h-8"
                onDone={onOrderUpdated}
              />
            ) : (
              <Button type="button" size="sm" variant="outline" disabled>
                취소
              </Button>
            )}
          </div>
        </CardContent>
      ) : (
        <CardContent className="border-border border-t pt-3">
          <p className="text-muted-foreground text-xs">
            테이블에서 거래 행을 눌러 계약 상세를 표시합니다.
          </p>
        </CardContent>
      )}

      <CardContent className={`space-y-3 ${orderRow && oid !== null ? "pt-0" : ""}`}>
        <div>
          <p className="text-muted-foreground text-xs">현재 수량</p>
          <p className="text-2xl font-semibold tabular-nums">{current.toLocaleString("ko-KR")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">기준 재고</p>
            <p className="tabular-nums">{base.toLocaleString("ko-KR")}</p>
            <p className="text-muted-foreground">{row.base_date ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">누적 변동</p>
            <p className={`tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {delta >= 0 ? "+" : ""}
              {delta.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
        {row.last_movement_date ? (
          <div className="border-border border-t pt-2 text-xs">
            <p className="text-muted-foreground">최근 변동</p>
            <p>
              {row.last_movement_date} · {row.last_movement_type ?? "—"}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">변동 이력 없음</p>
        )}
      </CardContent>
    </Card>
  );
}
