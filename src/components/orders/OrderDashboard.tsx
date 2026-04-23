"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { ORDER_COMPANIES, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import { OrdersMarginProvider } from "@/components/analytics/cost/OrdersMarginContext";
import { OrdersListFilters } from "./OrdersListFilters";
import { OrdersTable } from "./OrdersTable";
import { OrdersActionPanel } from "./OrdersActionPanel";
import { OrdersStockSidebar } from "./OrdersStockSidebar";
import { OrdersExcelUploadDialog } from "./OrdersExcelUploadDialog";
import OrderContractAddForm from "./OrderContractAddForm";
import type { OrderErpDealKind } from "./OrderErpSyncPanel";
import {
  useOrders,
  type OrderDashboardRow,
  type OrderErpSystem,
  type OrderStatus,
  type OrderTxType,
} from "./_hooks/useOrders";
import type { PurchaseDashboardRow } from "./_hooks/buildContractRows";

const PAGE_SIZE = 10;

function isoDate(d: Date): string {
  // 로컬 날짜 고정 — 변경 이유: toISOString(UTC)로 전월 1일이 하루 전으로 밀리는 오프셋 방지
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** 상단 원천 조회 기본 기간 계산 — 변경 이유: 기본값을 전월 1일~오늘로 고정 */
function defaultSyncDateRange(): [string, string] {
  const now = new Date();
  const prevMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [isoDate(prevMonthFirst), isoDate(now)];
}

const SYNC_DATE_PRESETS: { label: string; compute: () => [string | null, string | null] }[] = [
  { label: "최근 1주", compute: () => [daysAgo(7), isoDate(new Date())] },
  { label: "최근 1개월", compute: () => [daysAgo(30), isoDate(new Date())] },
  { label: "최근 3개월", compute: () => [daysAgo(90), isoDate(new Date())] },
  { label: "전체", compute: () => [null, null] },
];

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

/** ERP 원천 행에 목록 필터 적용 — 변경 이유: Supabase 뷰(useOrders)와 동일 조건으로 칩·검색·기간 반영 */
function filterRawEcountRowsForList(
  list: OrderDashboardRow[],
  erpSystems: OrderErpSystem[],
  txTypes: OrderTxType[],
  search: string,
  from: string | null,
  to: string | null
): OrderDashboardRow[] {
  if (txTypes.length === 0) return [];
  let out = list.filter(
    (r) => r.erp_system !== null && erpSystems.includes(r.erp_system as OrderErpSystem)
  );
  out = out.filter((r) => {
    const t = r.tx_type;
    return t !== null && txTypes.includes(t as OrderTxType);
  });
  const term = search.trim().toLowerCase();
  if (term) {
    out = out.filter((r) => {
      const name = (r.item_name ?? r.erp_item_name_raw ?? "").toLowerCase();
      const code = (r.erp_code ?? "").toLowerCase();
      return name.includes(term) || code.includes(term);
    });
  }
  if (from) {
    out = out.filter((r) => {
      const d = r.tx_date ? String(r.tx_date).slice(0, 10) : "";
      return d >= from;
    });
  }
  if (to) {
    out = out.filter((r) => {
      const d = r.tx_date ? String(r.tx_date).slice(0, 10) : "";
      return d <= to;
    });
  }
  return out;
}

/**
 * 주문 관리 대시보드 (승인 워크플로우 기반)
 *
 * - 데이터 소스: v_orders_dashboard (orders + item_master + stock_movement 조인 뷰)
 * - 상태 흐름: pending → approved(DB 트리거가 stock_movement 생성) / rejected(사유 기록)
 * - 사이드: OrdersMarginContext로 cost/MarginCalculator에 선택 주문 정보 전달 (현재는 null — 후속 PR에서 연동)
 */
export default function OrderDashboard() {
  const [defaultSyncFrom, defaultSyncTo] = defaultSyncDateRange();
  /** 빈 배열 = 기업 전체 */
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<OrderCompanyCode[]>([]);
  /** 서버에서 Python 크롤 실행 중 */
  const [ingestLoading, setIngestLoading] = useState(false);
  /** 원천 ecount_* 테이블 추출 모드 */
  const [useRawEcountView, setUseRawEcountView] = useState(false);
  /** 원천 ecount_* 테이블에서 추출·정규화한 행 */
  const [rawEcountRows, setRawEcountRows] = useState<OrderDashboardRow[] | null>(null);
  /** 원천 ecount_* 추출 에러 */
  const [rawEcountError, setRawEcountError] = useState<string | null>(null);
  /** 상단 ERP 원천 조회용 기간 */
  const [syncDateFrom, setSyncDateFrom] = useState<string | null>(defaultSyncFrom);
  const [syncDateTo, setSyncDateTo] = useState<string | null>(defaultSyncTo);
  const [syncCalendarOpen, setSyncCalendarOpen] = useState(false);

  const singleCompanyOrNull = selectedCompanyCodes.length === 1 ? selectedCompanyCodes[0] : null;

  // 필터 상태
  const [status, setStatus] = useState<OrderStatus>("pending");
  /** 검색 카드 기업: 비어 있으면 상단 기업 범위와 동일, 1개 이상이면 선택한 기업만(다중) */
  const [narrowCompanies, setNarrowCompanies] = useState<OrderErpSystem[]>([]);
  /** 검색 카드 거래유형: 비어 있으면 상단 범위와 동일, 1개 이상이면 선택한 유형만(다중) */
  const [narrowDealKinds, setNarrowDealKinds] = useState<OrderErpDealKind[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const dateFrom: string | null = null;
  const dateTo: string | null = null;
  const [page, setPage] = useState(0);

  // 선택/포커스 상태
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusedItemId, setFocusedItemId] = useState<number | null>(null);
  /** 테이블 행 클릭 시 사이드바 계약 블록에 넘길 주문 행 */
  const [focusedOrderRow, setFocusedOrderRow] = useState<OrderDashboardRow | null>(null);

  /** 상단 카드와 동일한 목록 조회 범위(기업) */
  const listScopeCompanies = useMemo<OrderCompanyCode[]>(
    () => (selectedCompanyCodes.length === 0 ? ["gl", "glpharm", "hnb"] : selectedCompanyCodes),
    [selectedCompanyCodes]
  );
  /** 상단 카드와 동일한 목록 조회 범위(거래) — 거래 유형 토글 제거 후 전 유형 고정 */
  const listScopeDealKinds = useMemo<OrderErpDealKind[]>(
    () => ["purchase", "sales", "returns", "production"],
    []
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

  /** 서버 API(service_role)로 원천 조회 — 변경 이유: 브라우저 anon은 RLS로 0건만 올 수 있음 */
  const fetchRawEcountRows = useCallback(async (): Promise<OrderDashboardRow[]> => {
    const res = await fetch("/api/orders/ecount-excel-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 조회 기간 전달 — 변경 이유: 상단 기간 선택으로 원천 테이블 조회 범위를 제한
      body: JSON.stringify({
        companyCodes: selectedCompanyCodes,
        dateFrom: syncDateFrom,
        dateTo: syncDateTo,
      }),
    });
    const body = (await res.json()) as { rows?: OrderDashboardRow[]; error?: string };
    if (!res.ok) {
      throw new Error(body.error ?? "원천 데이터 조회에 실패했습니다.");
    }
    return body.rows ?? [];
  }, [selectedCompanyCodes, syncDateFrom, syncDateTo]);

  /** 기업 토글 — 배열에 있으면 해제, 없으면 추가 */
  const toggleCompanyCode = useCallback((code: OrderCompanyCode) => {
    setSelectedCompanyCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  /** 선택 기업의 Supabase 엑셀 원천 테이블만 조회해 단일 표에 표시 — 변경 이유: ECOUNT 크롤 대신 DB 직접 조회 */
  const loadDataForSelection = useCallback(async () => {
    setIngestLoading(true);
    setUseRawEcountView(true);
    setRawEcountError(null);
    try {
      setPage(0);
      setSelected(new Set());
      setFocusedOrderRow(null);
      setFocusedItemId(null);
      const extracted = await fetchRawEcountRows();
      setRawEcountRows(extracted);

      toast.success(`Supabase에서 ${extracted.length.toLocaleString("ko-KR")}건을 불러왔습니다.`);

      void refetchFromStart();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById("orders-dashboard-table")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "데이터 조회에 실패했습니다.";
      setRawEcountRows([]);
      setRawEcountError(msg);
      toast.error(msg);
    } finally {
      setIngestLoading(false);
    }
  }, [fetchRawEcountRows, refetchFromStart]);

  const filteredRawEcountRows = useMemo(() => {
    if (rawEcountRows === null) return null;
    return filterRawEcountRowsForList(
      rawEcountRows,
      effectiveErpSystems,
      effectiveTxTypes,
      itemSearch,
      dateFrom,
      dateTo
    );
  }, [rawEcountRows, effectiveErpSystems, effectiveTxTypes, itemSearch, dateFrom, dateTo]);

  /** 필터로 건수가 줄면 빈 페이지 방지 — 변경 이유: ERP 원천 모드는 클라이언트 페이징 */
  useEffect(() => {
    if (!useRawEcountView || filteredRawEcountRows === null) return;
    const maxPage = Math.max(0, Math.ceil(filteredRawEcountRows.length / PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [useRawEcountView, filteredRawEcountRows, page]);

  const displayedRows = useMemo(() => {
    if (!useRawEcountView) return rows;
    if (rawEcountRows === null) return rows;
    if (filteredRawEcountRows === null) return rows;
    const from = page * PAGE_SIZE;
    return filteredRawEcountRows.slice(from, from + PAGE_SIZE);
  }, [useRawEcountView, rawEcountRows, rows, page, filteredRawEcountRows]);

  const displayedTotalCount = useMemo(
    () =>
      useRawEcountView
        ? rawEcountRows === null
          ? totalCount
          : (filteredRawEcountRows?.length ?? 0)
        : totalCount,
    [useRawEcountView, rawEcountRows, totalCount, filteredRawEcountRows]
  );

  const displayedLoading = useMemo(
    () => (useRawEcountView ? ingestLoading : loading),
    [useRawEcountView, ingestLoading, loading]
  );

  const displayedError = useMemo(
    () => (useRawEcountView ? rawEcountError : error),
    [useRawEcountView, rawEcountError, error]
  );

  useEffect(() => {
    if (focusedOrderRow?.order_id === null || focusedOrderRow?.order_id === undefined) return;
    const latest = displayedRows.find((r) => r.order_id === focusedOrderRow.order_id);
    if (!latest) return;
    // 포커스 행 최신화 — 변경 이유: 재조회/필터 후 사이드 카드 수량 기준을 현재 표 행과 일치
    if (latest !== focusedOrderRow) {
      setFocusedOrderRow(latest);
      const latestItemId = latest.item_id ?? null;
      if (latestItemId !== focusedItemId) setFocusedItemId(latestItemId);
    }
  }, [displayedRows, focusedOrderRow, focusedItemId]);

  return (
    <OrdersMarginProvider value={null}>
      <Tabs defaultValue="list" className="gap-4">
        <TabsList>
          <TabsTrigger value="list">주문 목록</TabsTrigger>
          <TabsTrigger value="contract">신규 계약 추가</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="flex flex-col gap-4">
          {/* 기업/기간 선택 + ERP 불러오기/엑셀 업로드/새로고침 */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col gap-4">
                {/* 기업 · 기간 가로 배치 — 중앙 정렬 */}
                <div className="flex flex-col items-center justify-center gap-3 lg:flex-row lg:gap-8">
                  {/* 기업 선택 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-muted-foreground text-sm font-medium">기업</Label>
                    <Button
                      type="button"
                      variant={selectedCompanyCodes.length === 0 ? "secondary" : "outline"}
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => setSelectedCompanyCodes([])}
                    >
                      전체
                    </Button>
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
                  {/* 기간 선택 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-muted-foreground text-sm font-medium">기간</Label>
                    <Popover open={syncCalendarOpen} onOpenChange={setSyncCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 shrink-0 font-normal">
                          <CalendarDays className="mr-1 h-4 w-4" />
                          {syncDateFrom ?? "전체"} ~ {syncDateTo ?? "전체"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="flex border-b">
                          {SYNC_DATE_PRESETS.map((p) => (
                            <Button
                              key={p.label}
                              variant="ghost"
                              size="sm"
                              className="rounded-none"
                              onClick={() => {
                                const [from, to] = p.compute();
                                setSyncDateFrom(from);
                                setSyncDateTo(to);
                              }}
                            >
                              {p.label}
                            </Button>
                          ))}
                        </div>
                        <Calendar
                          mode="range"
                          selected={{
                            from: syncDateFrom ? new Date(syncDateFrom) : undefined,
                            to: syncDateTo ? new Date(syncDateTo) : undefined,
                          }}
                          onSelect={(range) => {
                            setSyncDateFrom(range?.from ? isoDate(range.from) : null);
                            setSyncDateTo(range?.to ? isoDate(range.to) : null);
                          }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* 중앙 주요 버튼 + 바로 옆 새로고침 아이콘 */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    type="button"
                    className="h-9 px-5 text-sm"
                    disabled={ingestLoading}
                    onClick={() => void loadDataForSelection()}
                  >
                    {ingestLoading
                      ? "Supabase에서 데이터를 불러오는 중입니다…"
                      : "ERP 데이터 불러오기"}
                  </Button>
                  <OrdersExcelUploadDialog
                    companyCode={singleCompanyOrNull}
                    purchases={purchases}
                    onImported={refetch}
                    triggerClassName="h-9 px-5 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="새로고침"
                    title="새로고침"
                    className="h-9 w-9"
                    onClick={() => {
                      // 새로고침 초기화 동작 — 변경 이유: 버튼 클릭 시 표의 모든 표시 데이터를 즉시 비움
                      setUseRawEcountView(true);
                      setRawEcountRows([]);
                      setRawEcountError(null);
                      setSelected(new Set());
                      setFocusedOrderRow(null);
                      setFocusedItemId(null);
                      setPage(0);
                      toast.success("표시 데이터를 초기화했습니다.");
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 검색 · ERP 적재 · 주문 테이블(건수·상태는 테이블 하단) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">검색</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
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
                status={useRawEcountView ? undefined : status}
                onStatusChange={
                  useRawEcountView
                    ? undefined
                    : (s) => {
                        setStatus(s);
                        setPage(0);
                      }
                }
              />
              <div className="space-y-3">
                {!useRawEcountView && (
                  <OrdersActionPanel
                    selectedIds={selectedIds}
                    onActionComplete={handleActionComplete}
                  />
                )}
                {/* 테이블 하단 배치 — 변경 이유: 현재 재고 카드가 주문표 아래에 항상 나오도록 레이아웃 단순화 */}
                <div id="orders-dashboard-table" className="min-w-0 scroll-mt-28 space-y-3">
                  <OrdersTable
                    rows={displayedRows satisfies OrderDashboardRow[]}
                    totalCount={displayedTotalCount}
                    loading={displayedLoading}
                    error={displayedError}
                    page={page}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    selected={useRawEcountView ? new Set<number>() : selected}
                    onSelectedChange={useRawEcountView ? () => {} : setSelected}
                    onRowFocus={(row) => {
                      setFocusedOrderRow(row);
                      setFocusedItemId(row.item_id ?? null);
                    }}
                  />
                  {/* 재고 승인 다이얼로그 — 행 선택 시 열림 */}
                  <OrdersStockSidebar
                    itemId={focusedItemId}
                    orderRow={focusedOrderRow}
                    onClose={() => {
                      setFocusedOrderRow(null);
                      setFocusedItemId(null);
                    }}
                    onOrderUpdated={() => {
                      if (useRawEcountView) {
                        void (async () => {
                          setIngestLoading(true);
                          try {
                            const extracted = await fetchRawEcountRows();
                            setRawEcountRows(extracted);
                          } catch (e) {
                            setRawEcountError(
                              e instanceof Error ? e.message : "원천 데이터 조회 실패"
                            );
                          } finally {
                            setIngestLoading(false);
                          }
                        })();
                        return;
                      }
                      void refetch();
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contract" className="flex flex-col gap-4">
          {/* 신규 계약 — 폼 내 기업 선택(상단 필터와 독립) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">신규 계약 추가</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderContractAddForm onAdded={refetch} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </OrdersMarginProvider>
  );
}
