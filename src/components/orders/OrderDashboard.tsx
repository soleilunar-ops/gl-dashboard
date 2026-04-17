"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ORDER_COMPANIES, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import { OrdersMarginProvider } from "@/components/analytics/cost/OrdersMarginContext";
import { OrdersHeader } from "./OrdersHeader";
import { OrdersTable } from "./OrdersTable";
import { OrdersActionPanel } from "./OrdersActionPanel";
import { OrdersStockSidebar } from "./OrdersStockSidebar";
import { OrdersExcelUploadDialog } from "./OrdersExcelUploadDialog";
import OrderContractAddForm from "./OrderContractAddForm";
import {
  useOrders,
  type OrderDashboardRow,
  type OrderErpSystem,
  type OrderStatus,
  type OrderTxType,
} from "./_hooks/useOrders";
import type { PurchaseDashboardRow } from "./_hooks/buildContractRows";

const DEFAULT_ERP_SYSTEMS: OrderErpSystem[] = ["gl", "gl_pharm", "hnb"];
const DEFAULT_TX_TYPES: OrderTxType[] = ["purchase", "sale", "return_sale", "return_purchase"];
const PAGE_SIZE = 50;

/**
 * 주문 관리 대시보드 (승인 워크플로우 기반)
 *
 * - 데이터 소스: v_orders_dashboard (orders + item_master + stock_movement 조인 뷰)
 * - 상태 흐름: pending → approved(DB 트리거가 stock_movement 생성) / rejected(사유 기록)
 * - 사이드: OrdersMarginContext로 cost/MarginCalculator에 선택 주문 정보 전달 (현재는 null — 후속 PR에서 연동)
 */
export default function OrderDashboard() {
  // 엑셀 업로드/수동 입력의 대상 기업 (필터와 별개)
  const [uploadCompany, setUploadCompany] = useState<OrderCompanyCode | null>("gl_pharm");

  // 필터 상태
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [erpSystems, setErpSystems] = useState<OrderErpSystem[]>(DEFAULT_ERP_SYSTEMS);
  const [txTypes, setTxTypes] = useState<OrderTxType[]>(DEFAULT_TX_TYPES);
  const [itemSearch, setItemSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // 선택/포커스 상태
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusedItemId, setFocusedItemId] = useState<number | null>(null);

  const { rows, totalCount, loading, error, refetch } = useOrders({
    status,
    erpSystems,
    txTypes,
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
  useEffect(() => {
    if (!uploadCompany) {
      setPurchases([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("v_orders_dashboard")
        .select(
          "order_id, tx_date, item_id, item_name, item_name_raw, erp_code, erp_tx_no, erp_item_name_raw, counterparty, erp_system, quantity, unit_price, total_amount, supply_amount, vat, memo, status, tx_type"
        )
        .eq("erp_system", uploadCompany)
        .eq("tx_type", "purchase")
        .order("tx_date", { ascending: false })
        .limit(5000);
      if (cancelled) return;
      setPurchases((data ?? []) as PurchaseDashboardRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, uploadCompany]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  return (
    <OrdersMarginProvider value={null}>
      <div className="flex flex-col gap-4">
        {/* 업로드/입력 대상 기업 선택 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">기업 선택 (엑셀 업로드 / 수동 입력용)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">대상 기업</Label>
              <Select
                value={uploadCompany ?? ""}
                onValueChange={(v) => setUploadCompany(v as OrderCompanyCode)}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue placeholder="기업 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_COMPANIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <OrdersExcelUploadDialog
              companyCode={uploadCompany}
              purchases={purchases}
              onImported={refetch}
            />
            <Button variant="ghost" size="sm" onClick={() => void refetch()}>
              새로고침
            </Button>
          </CardContent>
        </Card>

        {/* 수동 입력 폼 */}
        <OrderContractAddForm selectedCompanyCode={uploadCompany} onAdded={refetch} />

        {/* 필터 + 카운트 카드 */}
        <OrdersHeader
          status={status}
          onStatusChange={(s) => {
            setStatus(s);
            setPage(0);
          }}
          erpSystems={erpSystems}
          onErpSystemsChange={(v) => {
            setErpSystems(v);
            setPage(0);
          }}
          txTypes={txTypes}
          onTxTypesChange={(v) => {
            setTxTypes(v);
            setPage(0);
          }}
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

        {/* 일괄 액션 */}
        <OrdersActionPanel selectedIds={selectedIds} onActionComplete={handleActionComplete} />

        {/* 테이블 + 사이드바 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
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
            onRowFocus={setFocusedItemId}
            onActionComplete={handleActionComplete}
          />
          <OrdersStockSidebar itemId={focusedItemId} />
        </div>
      </div>
    </OrdersMarginProvider>
  );
}
