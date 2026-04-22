"use client";

/**
 * ErpDataView — 이카운트 크롤링 결과(구매/판매/재고수불부)
 * 변경 이유: 탭별 표 UI를 OrderErpIngestTable·주문 표와 동일하게 통일
 */
import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { OrderErpIngestTable } from "./OrderErpIngestTable";
import {
  useErpData,
  DEFAULT_ERP_PAGE_SIZE,
  type ErpMenu,
  type CompanyCode,
  type ErpRow,
} from "./_hooks/useErpData";

export default function ErpDataView() {
  const [menu, setMenu] = useState<ErpMenu>("purchase");
  const [companyCode, setCompanyCode] = useState<CompanyCode | "all">("all");
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({
    from: "2024-01-01",
    to: new Date().toISOString().slice(0, 10),
  });
  const [page, setPage] = useState(0);
  const pageSize = DEFAULT_ERP_PAGE_SIZE;

  const effectiveCompany: CompanyCode | "all" = menu === "stock_ledger" ? "gl" : companyCode;

  useEffect(() => {
    setPage(0);
  }, [menu, effectiveCompany, dateRange.from, dateRange.to]);

  const { rows, totalCount, loading, error, refetch } = useErpData({
    menu,
    companyCode: effectiveCompany,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    page,
    pageSize,
  });

  const summary = useMemo(() => {
    if (!totalCount) return null;
    const pageLabel = `${rows.length.toLocaleString("ko-KR")}행 표시 / 전체 ${totalCount.toLocaleString("ko-KR")}건`;
    if (menu === "stock_ledger") {
      let inSum = 0;
      let outSum = 0;
      for (const r of rows) {
        inSum += Number(r.inbound_qty ?? 0) || 0;
        outSum += Number(r.outbound_qty ?? 0) || 0;
      }
      return `${pageLabel} · 현재 페이지 입고 ${inSum.toLocaleString("ko-KR")} / 출고 ${outSum.toLocaleString("ko-KR")}`;
    }
    let totalSum = 0;
    for (const r of rows) {
      totalSum += Number(r.total_amount ?? 0) || 0;
    }
    return `${pageLabel} · 현재 페이지 합계 ${totalSum.toLocaleString("ko-KR")}원`;
  }, [rows, totalCount, menu]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isLastPage = (page + 1) * pageSize >= totalCount;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>ERP 데이터 (이카운트 크롤링)</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={effectiveCompany}
            onValueChange={(v) => setCompanyCode(v as CompanyCode | "all")}
            disabled={menu === "stock_ledger"}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="기업" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="gl">지엘</SelectItem>
              <SelectItem value="glpharm">지엘팜</SelectItem>
              <SelectItem value="hnb">HNB</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
              시작
              <input
                type="date"
                className="border-input bg-background h-9 rounded-md border px-2 text-xs"
                value={dateRange.from ?? ""}
                onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value || undefined }))}
              />
            </Label>
            <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
              종료
              <input
                type="date"
                className="border-input bg-background h-9 rounded-md border px-2 text-xs"
                value={dateRange.to ?? ""}
                onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value || undefined }))}
              />
            </Label>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={menu} onValueChange={(v) => setMenu(v as ErpMenu)}>
          <TabsList className="mb-4">
            <TabsTrigger value="purchase">구매현황</TabsTrigger>
            <TabsTrigger value="sales">판매현황</TabsTrigger>
            <TabsTrigger value="stock_ledger">재고수불부 (지엘)</TabsTrigger>
          </TabsList>

          <TabsContent value={menu} className="mt-0">
            {summary ? <div className="text-muted-foreground mb-2 text-sm">{summary}</div> : null}

            {error ? (
              <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                조회 실패: {error}
                <button type="button" className="ml-3 underline" onClick={refetch}>
                  재시도
                </button>
              </div>
            ) : null}

            <OrderErpIngestTable
              menu={menu}
              rows={rows as ErpRow[]}
              loading={loading}
              emptyMessage="선택한 기업/기간에 크롤링된 데이터가 없습니다. 크롤러를 먼저 실행해주세요."
            />

            <div className="text-muted-foreground mt-3 flex items-center justify-end gap-2 text-xs">
              <span>
                {(page + 1).toLocaleString("ko-KR")} / {totalPages.toLocaleString("ko-KR")}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isLastPage || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
