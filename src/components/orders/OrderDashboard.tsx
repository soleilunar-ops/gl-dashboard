"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ORDER_COMPANIES, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import { OrdersMarginProvider } from "@/components/analytics/cost/OrdersMarginContext";
import { OrdersHeader } from "./OrdersHeader";
import { OrdersListFilters } from "./OrdersListFilters";
import { OrdersTable } from "./OrdersTable";
import { OrdersActionPanel } from "./OrdersActionPanel";
import { OrdersStockSidebar } from "./OrdersStockSidebar";
import { OrdersExcelUploadDialog } from "./OrdersExcelUploadDialog";
import OrderContractAddForm from "./OrderContractAddForm";
import { OrderErpSyncPanel, type OrderErpDealKind } from "./OrderErpSyncPanel";
import {
  useOrders,
  type OrderDashboardRow,
  type OrderErpSystem,
  type OrderStatus,
  type OrderTxType,
} from "./_hooks/useOrders";
import type { PurchaseDashboardRow } from "./_hooks/buildContractRows";

const PAGE_SIZE = 20;

/** 브라우저에 저장하는 마지막 ECOUNT→ERP 적재 완료 시각 (ISO 문자열) */
const ERP_SYNC_TIME_STORAGE_KEY = "orders-dashboard-last-erp-sync-at";

/** ERP 연동 시각 표시용 (한국어 로캘) */
function formatKoreanDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** ERP 거래유형 묶음 → orders.tx_type 목록 */
function dealKindToTxTypes(kind: OrderErpDealKind): OrderTxType[] {
  if (kind === "purchase") return ["purchase"];
  if (kind === "sales") return ["sale"];
  if (kind === "production") return ["production_in"];
  return ["return_sale", "return_purchase"];
}

function unionDealKindsToTx(kinds: OrderErpDealKind[]): OrderTxType[] {
  const acc = new Set<OrderTxType>();
  for (const k of kinds) dealKindToTxTypes(k).forEach((t) => acc.add(t));
  return [...acc];
}

/**
 * 주문 관리 대시보드 (승인 워크플로우 기반)
 *
 * - 데이터 소스: v_orders_dashboard (orders + item_master + stock_movement 조인 뷰)
 * - 상태 흐름: pending → approved(DB 트리거가 stock_movement 생성) / rejected(사유 기록)
 * - 사이드: OrdersMarginContext로 cost/MarginCalculator에 선택 주문 정보 전달 (현재는 null — 후속 PR에서 연동)
 */
function erpDealSectionTitle(kind: OrderErpDealKind): string {
  if (kind === "purchase") return "구매";
  if (kind === "sales") return "판매";
  if (kind === "production") return "생산입고";
  return "반품 · 재고수불";
}

export default function OrderDashboard() {
  /** 빈 배열 = 기업 전체 */
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<OrderCompanyCode[]>([]);
  /** 다중 선택 가능 */
  const [selectedDealKinds, setSelectedDealKinds] = useState<OrderErpDealKind[]>([]);
  const [erpSyncOpen, setErpSyncOpen] = useState(false);
  const [erpSyncTick, setErpSyncTick] = useState(0);
  /** 서버에서 Python 크롤 실행 중 */
  const [ingestLoading, setIngestLoading] = useState(false);
  /** 마지막 「선택 조건으로 데이터 불러오기」 성공 시각 */
  const [lastErpSyncAtIso, setLastErpSyncAtIso] = useState<string | null>(null);

  const singleCompanyOrNull = selectedCompanyCodes.length === 1 ? selectedCompanyCodes[0] : null;

  // 필터 상태
  const [status, setStatus] = useState<OrderStatus>("pending");
  /** 검색 카드 기업: 비어 있으면 상단 기업 범위와 동일, 1개 이상이면 선택한 기업만(다중) */
  const [narrowCompanies, setNarrowCompanies] = useState<OrderErpSystem[]>([]);
  /** 검색 카드 거래유형: 비어 있으면 상단 범위와 동일, 1개 이상이면 선택한 유형만(다중) */
  const [narrowDealKinds, setNarrowDealKinds] = useState<OrderErpDealKind[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // 선택/포커스 상태
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusedItemId, setFocusedItemId] = useState<number | null>(null);
  /** 테이블 행 클릭 시 사이드바 계약 블록에 넘길 주문 행 */
  const [focusedOrderRow, setFocusedOrderRow] = useState<OrderDashboardRow | null>(null);

  /** 상단 카드와 동일한 목록 조회 범위(기업) */
  const listScopeCompanies = useMemo<OrderCompanyCode[]>(
    () => (selectedCompanyCodes.length === 0 ? ["gl", "gl_pharm", "hnb"] : selectedCompanyCodes),
    [selectedCompanyCodes]
  );
  /** 상단 카드와 동일한 목록 조회 범위(거래) */
  const listScopeDealKinds = useMemo<OrderErpDealKind[]>(
    () =>
      selectedDealKinds.length === 0
        ? ["purchase", "sales", "returns", "production"]
        : selectedDealKinds,
    [selectedDealKinds]
  );

  const effectiveErpSystems = useMemo<OrderErpSystem[]>(() => {
    if (narrowCompanies.length === 0) return listScopeCompanies as OrderErpSystem[];
    const picked = narrowCompanies.filter((c) =>
      listScopeCompanies.includes(c as OrderCompanyCode)
    ) as OrderErpSystem[];
    return picked.length > 0 ? picked : (listScopeCompanies as OrderErpSystem[]);
  }, [narrowCompanies, listScopeCompanies]);

  const effectiveTxTypes = useMemo<OrderTxType[]>(() => {
    const scoped = narrowDealKinds.filter((k) => listScopeDealKinds.includes(k));
    const kinds =
      narrowDealKinds.length === 0
        ? listScopeDealKinds
        : scoped.length > 0
          ? scoped
          : listScopeDealKinds;
    return unionDealKindsToTx(kinds);
  }, [narrowDealKinds, listScopeDealKinds]);

  useEffect(() => {
    setNarrowCompanies((prev) =>
      prev.filter((c) => listScopeCompanies.includes(c as OrderCompanyCode))
    );
  }, [listScopeCompanies]);

  useEffect(() => {
    setNarrowDealKinds((prev) => prev.filter((k) => listScopeDealKinds.includes(k)));
  }, [listScopeDealKinds]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ERP_SYNC_TIME_STORAGE_KEY);
      if (saved) setLastErpSyncAtIso(saved);
    } catch {
      /* 저장소 접근 불가 시 무시 */
    }
  }, []);

  const toggleNarrowCompany = useCallback((code: OrderErpSystem) => {
    setNarrowCompanies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setPage(0);
  }, []);

  const toggleNarrowDealKind = useCallback((kind: OrderErpDealKind) => {
    setNarrowDealKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
    setPage(0);
  }, []);

  const { rows, totalCount, loading, error, refetch, refetchFromStart } = useOrders({
    status,
    erpSystems: effectiveErpSystems,
    txTypes: effectiveTxTypes,
    itemSearch,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
  });

  const handleActionComplete = useCallback(() => {
    setSelected(new Set());
    void refetch();
  }, [refetch]);

  // 엑셀 다운로드용 purchase 조회 (uploadCompany 기준)
  const [purchases, setPurchases] = useState<PurchaseDashboardRow[]>([]);
  const supabase = useMemo(() => createClient(), []);
  const companyCodesAll = useMemo(() => ORDER_COMPANIES.map((c) => c.code), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let q = supabase
        .from("v_orders_dashboard")
        .select(
          "order_id, tx_date, item_id, item_name, item_name_raw, erp_code, erp_tx_no, erp_item_name_raw, counterparty, erp_system, quantity, unit_price, total_amount, supply_amount, vat, memo, status, tx_type"
        )
        .eq("tx_type", "purchase")
        .order("tx_date", { ascending: false })
        .limit(5000);
      q =
        selectedCompanyCodes.length === 0
          ? q.in("erp_system", companyCodesAll)
          : q.in("erp_system", selectedCompanyCodes);
      const { data } = await q;
      if (cancelled) return;
      setPurchases((data ?? []) as PurchaseDashboardRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedCompanyCodes, companyCodesAll]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  /** 기업 토글 — 배열에 있으면 해제, 없으면 추가 */
  const toggleCompanyCode = useCallback((code: OrderCompanyCode) => {
    setSelectedCompanyCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  /** 거래유형 토글 — 배열에 있으면 해제, 없으면 추가 */
  const toggleDealKind = useCallback((kind: OrderErpDealKind) => {
    setSelectedDealKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }, []);

  /** 선택 기업·거래와 동일하게 이카운트 크롤 → DB 적재 후 매핑 기준 미리보기·목록 갱신 */
  const loadDataForSelection = useCallback(async () => {
    setIngestLoading(true);
    try {
      const res = await fetch("/api/crawl/ecount-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCodes: selectedCompanyCodes,
          dealKinds: listScopeDealKinds,
          dateFrom: "2024-01-01",
          dateTo: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        warning?: string;
        failures?: string[];
      };

      if (!res.ok && res.status !== 207) {
        throw new Error(data.error ?? "적재 요청에 실패했습니다.");
      }

      if (data.failures && data.failures.length > 0) {
        toast.warning(data.warning ?? "일부 메뉴만 적재되었습니다.", {
          description: data.failures.slice(0, 5).join("\n"),
          duration: 12_000,
        });
      } else {
        toast.success(data.message ?? "적재가 완료되었습니다.");
      }

      const finishedAt = new Date().toISOString();
      setLastErpSyncAtIso(finishedAt);
      try {
        localStorage.setItem(ERP_SYNC_TIME_STORAGE_KEY, finishedAt);
      } catch {
        /* 저장 실패 무시 */
      }

      setErpSyncOpen(true);
      setErpSyncTick((k) => k + 1);
      setPage(0);
      await refetchFromStart();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById("orders-dashboard-table")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "적재에 실패했습니다.");
    } finally {
      setIngestLoading(false);
    }
  }, [selectedCompanyCodes, listScopeDealKinds, refetchFromStart]);

  return (
    <OrdersMarginProvider value={null}>
      <div className="flex flex-col gap-4">
        {/* 제목 + 대상 기업·거래·ERP·엑셀·새로고침만 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">기업/거래유형 선택</CardTitle>
            <p className="text-muted-foreground text-xs">
              중복 선택 가능 · 적재 원장(ecount_sales·purchase·stock_ledger 등)이 orders로 합쳐진 뒤
              승인 시 재고에 반영됩니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-muted-foreground w-full text-xs sm:w-auto">기업</Label>
                <Button
                  type="button"
                  variant={selectedCompanyCodes.length === 0 ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setSelectedCompanyCodes([])}
                >
                  전체
                </Button>
                <div className="flex flex-wrap justify-start gap-1">
                  {ORDER_COMPANIES.map((c) => (
                    <Button
                      key={c.code}
                      type="button"
                      variant={selectedCompanyCodes.includes(c.code) ? "secondary" : "outline"}
                      size="sm"
                      className="h-9 shrink-0 px-3"
                      onClick={() => toggleCompanyCode(c.code)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-muted-foreground w-full text-xs sm:w-auto">거래 유형</Label>
                <Button
                  type="button"
                  variant={selectedDealKinds.length === 0 ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setSelectedDealKinds([])}
                >
                  전체
                </Button>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant={selectedDealKinds.includes("purchase") ? "secondary" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 px-3"
                    onClick={() => toggleDealKind("purchase")}
                  >
                    구매
                  </Button>
                  <Button
                    type="button"
                    variant={selectedDealKinds.includes("sales") ? "secondary" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 px-3"
                    onClick={() => toggleDealKind("sales")}
                  >
                    판매
                  </Button>
                  <Button
                    type="button"
                    variant={selectedDealKinds.includes("returns") ? "secondary" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 px-3"
                    onClick={() => toggleDealKind("returns")}
                  >
                    반품
                  </Button>
                  <Button
                    type="button"
                    variant={selectedDealKinds.includes("production") ? "secondary" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 px-3"
                    onClick={() => toggleDealKind("production")}
                  >
                    생산입고
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Button
                  type="button"
                  className="h-9 shrink-0"
                  disabled={ingestLoading}
                  onClick={() => void loadDataForSelection()}
                >
                  {ingestLoading
                    ? "ECOUNT에서 실제 데이터를 불러오는 중입니다…"
                    : "선택 조건으로 데이터 불러오기"}
                </Button>
                <OrdersExcelUploadDialog
                  companyCode={singleCompanyOrNull}
                  purchases={purchases}
                  onImported={refetch}
                  triggerClassName="h-9 shrink-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 shrink-0"
                  size="sm"
                  onClick={() => void refetch()}
                >
                  새로고침
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                ERP 연동 시간:{" "}
                {lastErpSyncAtIso
                  ? formatKoreanDateTime(lastErpSyncAtIso)
                  : "기록 없음 · 데이터 불러오기 완료 후 표시"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 신규 계약 — 폼 내 기업 선택(상단 필터와 독립) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">신규 계약 추가</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderContractAddForm onAdded={refetch} />
          </CardContent>
        </Card>

        {/* 검색 · ERP 적재 · 주문 테이블(건수·상태는 테이블 하단) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">검색</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              상단에서 고른 기업·거래 유형과 동일한 범위로 목록을 조회합니다. 「선택 조건으로 데이터
              불러오기」는 ECOUNT 적재 후 아래 주문 표에 합쳐진 건을 1페이지부터 다시 불러오며, 적재
              미리보기(ecount_* 패널)도 펼칩니다.
            </p>
            <OrdersListFilters
              variant="embedded"
              hideEmbeddedLabel
              listScopeCompanies={listScopeCompanies}
              listScopeDealKinds={listScopeDealKinds}
              narrowCompanies={narrowCompanies}
              narrowDealKinds={narrowDealKinds}
              onToggleNarrowCompany={toggleNarrowCompany}
              onToggleNarrowDealKind={toggleNarrowDealKind}
              itemSearch={itemSearch}
              onItemSearchChange={(v) => {
                setItemSearch(v);
                setPage(0);
              }}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
                setPage(0);
              }}
            />
            {erpSyncOpen ? (
              <div id="erp-ingest-preview" className="scroll-mt-4 space-y-4">
                {listScopeDealKinds.map((dk) => (
                  <div key={`${erpSyncTick}-${selectedCompanyCodes.join("-")}-${dk}`}>
                    <p className="text-muted-foreground mb-2 text-xs font-medium">
                      ERP 적재 · {erpDealSectionTitle(dk)}
                    </p>
                    <OrderErpSyncPanel companyCodes={selectedCompanyCodes} dealKind={dk} />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="border-muted space-y-3 border-t pt-3">
              <OrdersActionPanel
                selectedIds={selectedIds}
                onActionComplete={handleActionComplete}
              />
              <OrdersHeader
                status={status}
                onStatusChange={(s) => {
                  setStatus(s);
                  setPage(0);
                }}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
                {/* 변경 이유: ERP 적재 완료 후 스크롤 앵커로 주문 표가 보이게 함 */}
                <div id="orders-dashboard-table" className="min-w-0 scroll-mt-28 space-y-3">
                  <OrdersTable
                    rows={rows satisfies OrderDashboardRow[]}
                    totalCount={totalCount}
                    loading={loading}
                    error={error}
                    page={page}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    selected={selected}
                    onSelectedChange={setSelected}
                    onRowFocus={(row) => {
                      setFocusedOrderRow(row);
                      setFocusedItemId(row.item_id ?? null);
                    }}
                  />
                </div>
                <OrdersStockSidebar
                  itemId={focusedItemId}
                  orderRow={focusedOrderRow}
                  onOrderUpdated={() => void refetch()}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </OrdersMarginProvider>
  );
}
