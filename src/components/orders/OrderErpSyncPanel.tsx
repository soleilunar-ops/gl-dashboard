"use client";

/**
 * 주문 관리 1번 카드 — ERP 연동: Supabase ecount_* 조회(서버 크롤 적재분)
 * 변경 이유: 거래 유형별 이카운트 데이터 미리보기 테이블 제공
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { OrderCompanyCode } from "@/lib/orders/orderMeta";
import { OrderErpIngestTable } from "./OrderErpIngestTable";
import { useErpData, type CompanyCode, type ErpMenu, type ErpRow } from "./_hooks/useErpData";

const PAGE_SIZE = 25;

export type OrderErpDealKind = "purchase" | "sales" | "returns" | "production";

function menuFromDeal(d: OrderErpDealKind): ErpMenu {
  if (d === "returns") return "stock_ledger";
  if (d === "production") return "production_outsource";
  return d;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrderErpSyncPanel({
  companyCodes,
  dealKind,
}: {
  /** 빈 배열이면 세 기업 전체, 2개 이상이면 해당 기업만 IN 조회 */
  companyCodes: OrderCompanyCode[];
  dealKind: OrderErpDealKind;
}) {
  const menu = menuFromDeal(dealKind);
  const effectiveCompany: CompanyCode | "all" | readonly CompanyCode[] | "gl" =
    menu === "stock_ledger"
      ? "gl"
      : companyCodes.length === 0
        ? "all"
        : companyCodes.length === 1
          ? companyCodes[0]
          : companyCodes;

  const companyCodesKey = companyCodes.join(",");

  const [page, setPage] = useState(0);
  const dateFrom = "2024-01-01";
  const dateTo = useMemo(() => isoToday(), []);

  useEffect(() => {
    setPage(0);
  }, [dealKind, companyCodesKey, menu]);

  const { rows, totalCount, loading, error, refetch } = useErpData({
    menu,
    companyCode: effectiveCompany,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
    /** item_erp_mapping 등록 품목코드만 표시 — 구매·판매 행만 필터 대상 */
    onlyMappedMasterItems: true,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const isLastPage = (page + 1) * PAGE_SIZE >= totalCount;

  const showGlOnlyNote =
    dealKind === "returns" && !(companyCodes.length === 1 && companyCodes[0] === "gl");

  return (
    <div className="border-muted bg-muted/20 mt-2 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          적재 분은 상단 「선택 조건으로 데이터 불러오기」크롤 후 최신화됩니다. 구매·판매는{" "}
          item_erp_mapping ERP 코드만 표시합니다.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          다시 불러오기
        </Button>
      </div>

      {showGlOnlyNote && (
        <Alert>
          <AlertDescription className="text-xs">
            재고수불부는 지엘(gl) 데이터만 제공됩니다. 품목코드 열이 없어 매핑 필터는 적용하지
            않습니다.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          조회 실패: {error}
        </div>
      )}

      <OrderErpIngestTable
        menu={menu}
        rows={rows as ErpRow[]}
        loading={loading}
        emptyMessage="매핑된 품목코드에 해당하는 적재 행이 없습니다. 상단에서 데이터 불러오기를 실행하거나 매핑·기간을 확인하세요."
      />

      <div className="text-muted-foreground flex items-center justify-end gap-2 text-xs">
        <span>
          {(page + 1).toLocaleString("ko-KR")} / {totalPages.toLocaleString("ko-KR")} 페이지 · 전체{" "}
          {totalCount.toLocaleString("ko-KR")}건
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLastPage || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
