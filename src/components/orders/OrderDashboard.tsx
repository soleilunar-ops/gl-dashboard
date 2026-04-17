"use client";

import { RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import OrderContractAddForm from "./OrderContractAddForm";
import OrderExcelActionBar from "./OrderExcelActionBar";
import OrderExcelPreviewTable from "./OrderExcelPreviewTable";
import OrderTable from "./OrderTable";
import {
  buildContractRows,
  contractRowFromExcelPreview,
  excelPreviewRowKey,
} from "./_hooks/buildContractRows";
import { useOrderExcelWorkspace } from "./_hooks/useOrderExcelWorkspace";
import { useErpPurchases } from "./_hooks/useErpPurchases";
import { useExchangeRate } from "./_hooks/useExchangeRate";
import { useSkuApproximateMap } from "./_hooks/useSkuApproximateMap";
import { useStockMovementsInboundReturn } from "./_hooks/useStockMovementsInboundReturn";
import { ORDER_COMPANIES, companyLabel, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { PurchaseExcelParsedRow } from "@/lib/orders/purchaseExcel";

const INITIAL_CNY_KRW_RATE = 216.5;
const TABLE_PAGE_SIZE = 10;
const TODAY_DATE = new Date().toISOString().slice(0, 10);
const TODAY_MONTH = TODAY_DATE.slice(0, 7);

type DataSelection = "erp" | "excel";
type PaymentStatus = "계약" | "진행" | "완료";
type TransferMode = "quantity" | "amount" | "percent";

interface TransferState {
  advance_paid: boolean;
  remaining_paid_ratio: number;
  last_transfer_quantity: number | null;
  last_transfer_amount_cny: number | null;
  applied_rate: number | null;
  updated_at: string;
}

interface ExcelUploadHistoryItem {
  company_code: OrderCompanyCode;
  file_name: string;
  total_input: number;
  inserted_count: number;
  skipped_count: number;
  created_at: string;
}

function paymentStatusFromRatio(ratio: number): PaymentStatus {
  if (ratio >= 1) return "완료";
  if (ratio > 0) return "진행";
  return "계약";
}

function toTime(value: string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** 수입 계약(ERP 구매) + 엑셀 + 송금 기록 저장 — 주문 관리 통합 화면 */
export default function OrderDashboard() {
  const { data: purchases, loading: loadingPo, error: errPo, refetch } = useErpPurchases(5000);
  const {
    inboundTotalByProduct,
    returnTotalByProduct,
    loading: loadingMv,
    error: errMv,
  } = useStockMovementsInboundReturn();
  const { approximateByProductId, loading: loadingSku, error: errSku } = useSkuApproximateMap();
  const { exCurrent, usdKrwRate, rateStatus, isRateLoading, fetchExchangeRate } =
    useExchangeRate(INITIAL_CNY_KRW_RATE);

  const [sortType] = useState("latest");
  const [companyFilter, setCompanyFilter] = useState<OrderCompanyCode | null>(null);
  const [dataSelection, setDataSelection] = useState<DataSelection>("erp");
  const [statusFilter, setStatusFilter] = useState<"전체" | PaymentStatus>("전체");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [productFilter, setProductFilter] = useState("전체");
  const [supplierFilter, setSupplierFilter] = useState("전체");
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncingErp, setIsSyncingErp] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedExcelRow, setSelectedExcelRow] = useState<PurchaseExcelParsedRow | null>(null);
  const [excelStatusByRowKey, setExcelStatusByRowKey] = useState<
    Record<string, "계약" | "진행" | "완료">
  >({});

  const [transferStates, setTransferStates] = useState<Record<string, TransferState>>({});
  const [transferRate, setTransferRate] = useState(INITIAL_CNY_KRW_RATE);
  const [transferMode, setTransferMode] = useState<TransferMode>("quantity");
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferAmountCny, setTransferAmountCny] = useState(0);
  const [transferPercent, setTransferPercent] = useState(0);
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const isCompanySelected = companyFilter !== null;
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);
  const [excelHistory, setExcelHistory] = useState<ExcelUploadHistoryItem[]>([]);
  const [excelHistoryLoading, setExcelHistoryLoading] = useState(false);
  const [excelHistoryError, setExcelHistoryError] = useState<string | null>(null);

  const excelWs = useOrderExcelWorkspace(purchases, companyFilter, () => {
    void refetch();
  });

  const contractRows = useMemo(
    () =>
      buildContractRows(
        purchases,
        inboundTotalByProduct,
        returnTotalByProduct,
        approximateByProductId
      ),
    [approximateByProductId, inboundTotalByProduct, purchases, returnTotalByProduct]
  );

  useEffect(() => {
    const ids = contractRows.map((row) => row.id);
    if (ids.length === 0) {
      setTransferStates({});
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      try {
        const query = ids.map((id) => `purchaseId=${encodeURIComponent(id)}`).join("&");
        const response = await fetch(`/api/orders/transfer-records?${query}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          records?: Array<TransferState & { purchase_id: string }>;
          detail?: string;
          message?: string;
        };
        if (!response.ok) {
          setTransferMessage(
            `송금 기록 조회 실패: ${payload.detail ?? payload.message ?? response.status}`
          );
          return;
        }
        const next: Record<string, TransferState> = {};
        for (const item of payload.records ?? []) {
          next[item.purchase_id] = {
            advance_paid: item.advance_paid,
            remaining_paid_ratio: Number(item.remaining_paid_ratio ?? 0),
            last_transfer_quantity: item.last_transfer_quantity,
            last_transfer_amount_cny: item.last_transfer_amount_cny,
            applied_rate: item.applied_rate,
            updated_at: item.updated_at,
          };
        }
        setTransferStates(next);
      } catch (error) {
        if (controller.signal.aborted) return;
        const reason = error instanceof Error ? error.message : "네트워크 오류";
        setTransferMessage(`송금 기록 조회 실패: ${reason}`);
      }
    };
    void run();
    return () => controller.abort();
  }, [contractRows]);

  const productOptions = useMemo(() => {
    if (dataSelection === "excel" && excelWs.previewRows.length > 0) {
      const map = new Map<string, string>();
      for (const row of excelWs.previewRows) {
        const value = `${row.erpCode}|||${row.productName}`;
        if (!map.has(value)) map.set(value, `${row.erpCode} · ${row.productName}`);
      }
      return [
        { value: "전체", label: "전체" },
        ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
      ];
    }
    const map = new Map<string, string>();
    if (companyFilter === null) {
      return [{ value: "전체", label: "전체" }];
    }
    for (const row of contractRows.filter((item) => item.companyCode === companyFilter)) {
      const value = `${row.erpCode}|||${row.productName}`;
      if (!map.has(value)) map.set(value, `${row.erpCode} · ${row.productName}`);
    }
    return [
      { value: "전체", label: "전체" },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [companyFilter, contractRows, dataSelection, excelWs.previewRows]);

  const supplierOptions = useMemo(() => {
    if (dataSelection === "excel" && excelWs.previewRows.length > 0) {
      return [
        "전체",
        ...Array.from(new Set(excelWs.previewRows.map((row) => row.supplierName))).sort((a, b) =>
          a.localeCompare(b, "ko")
        ),
      ];
    }
    if (companyFilter === null) {
      return ["전체"];
    }
    return [
      "전체",
      ...Array.from(
        new Set(
          contractRows
            .filter((row) => row.companyCode === companyFilter)
            .map((row) => row.supplierName ?? "—")
        )
      ).filter(Boolean),
    ];
  }, [companyFilter, contractRows, dataSelection, excelWs.previewRows]);

  const dbFilteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (companyFilter === null) {
      return [];
    }
    return (
      contractRows
        .filter((row) => row.companyCode === companyFilter)
        .filter((row) => {
          if (dataSelection === "erp" && row.sourceKind !== "erp_api") return false;
          if (dataSelection === "excel" && row.sourceKind !== "excel_upload") return false;
          return true;
        })
        .filter((row) => {
          if (dateFilter && !row.purchaseDate.startsWith(`${dateFilter}-`)) return false;
          if (productFilter !== "전체") {
            const [selectedCode, selectedName] = productFilter.split("|||");
            if (row.erpCode !== selectedCode || row.productName !== selectedName) return false;
          }
          if (supplierFilter !== "전체" && (row.supplierName ?? "—") !== supplierFilter)
            return false;
          const paymentStatus = paymentStatusFromRatio(
            transferStates[row.id]?.remaining_paid_ratio ?? 0
          );
          if (statusFilter !== "전체" && paymentStatus !== statusFilter) return false;
          if (!q) return true;
          return (
            row.erpCode.toLowerCase().includes(q) ||
            row.productName.toLowerCase().includes(q) ||
            row.orderRef.toLowerCase().includes(q) ||
            (row.supplierName ?? "").toLowerCase().includes(q)
          );
        })
        // 변경 이유: 필터 이후에도 일자 기준 최신순이 항상 유지되도록 최종 정렬을 고정합니다.
        .sort((a, b) => toTime(b.purchaseDate) - toTime(a.purchaseDate))
    );
  }, [
    companyFilter,
    contractRows,
    dataSelection,
    dateFilter,
    productFilter,
    search,
    statusFilter,
    supplierFilter,
    transferStates,
  ]);

  const tableRows = useMemo(
    () =>
      dbFilteredRows.map((row) => ({
        ...row,
        paymentStatus: paymentStatusFromRatio(transferStates[row.id]?.remaining_paid_ratio ?? 0),
      })),
    [dbFilteredRows, transferStates]
  );

  const excelFilteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (
      excelWs.previewRows
        .filter((row) => {
          if (dateFilter && !row.purchaseDateIso.startsWith(`${dateFilter}-`)) return false;
          if (productFilter !== "전체") {
            const [selectedCode, selectedName] = productFilter.split("|||");
            if (row.erpCode !== selectedCode || row.productName !== selectedName) return false;
          }
          if (supplierFilter !== "전체" && row.supplierName !== supplierFilter) return false;
          if (!q) return true;
          return (
            row.erpCode.toLowerCase().includes(q) ||
            row.productName.toLowerCase().includes(q) ||
            row.erpRef.toLowerCase().includes(q) ||
            row.supplierName.toLowerCase().includes(q)
          );
        })
        // 변경 이유: 엑셀 미리보기도 주문 테이블과 동일하게 최신 일자 우선으로 노출합니다.
        .sort((a, b) => toTime(b.purchaseDateIso) - toTime(a.purchaseDateIso))
    );
  }, [dateFilter, excelWs.previewRows, productFilter, search, supplierFilter]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return tableRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [currentPage, tableRows, totalPages]);
  const excelSelectionKey = selectedExcelRow ? excelPreviewRowKey(selectedExcelRow) : null;

  const selectedRow = useMemo(() => {
    const fromDb = tableRows.find((row) => row.id === selectedId) ?? null;
    if (fromDb) return fromDb;
    if (selectedExcelRow !== null) return contractRowFromExcelPreview(selectedExcelRow);
    return null;
  }, [selectedExcelRow, selectedId, tableRows]);

  const transferCalc = useMemo(() => {
    if (!selectedRow || selectedRow.totalCny === null || selectedRow.totalCny === undefined)
      return null;
    const totalQty = selectedRow.quantity > 0 ? selectedRow.quantity : 1;
    const remainingCny = selectedRow.totalCny * 0.7;
    let qtyRatio = 0;
    let normalizedTransferQty = 0;
    let normalizedTransferAmountCny = 0;

    if (transferMode === "amount") {
      normalizedTransferAmountCny = Math.min(remainingCny, Math.max(0, transferAmountCny));
      qtyRatio = remainingCny > 0 ? normalizedTransferAmountCny / remainingCny : 0;
      normalizedTransferQty = totalQty * qtyRatio;
    } else if (transferMode === "percent") {
      const normalizedPercent = Math.min(100, Math.max(0, transferPercent));
      qtyRatio = normalizedPercent / 100;
      normalizedTransferQty = totalQty * qtyRatio;
      normalizedTransferAmountCny = remainingCny * qtyRatio;
    } else {
      normalizedTransferQty = Math.min(totalQty, Math.max(0, transferQuantity));
      qtyRatio = normalizedTransferQty / totalQty;
      normalizedTransferAmountCny = remainingCny * qtyRatio;
    }
    return {
      totalQty,
      normalizedTransferQty,
      remainingCny,
      transferCny: normalizedTransferAmountCny,
      transferKrw: normalizedTransferAmountCny * transferRate,
      remainingProgressPercent: qtyRatio * 100,
      totalProgressPercent: 30 + qtyRatio * 70,
      advancePaidCny: selectedRow.totalCny * 0.3,
    };
  }, [
    selectedRow,
    transferAmountCny,
    transferMode,
    transferPercent,
    transferQuantity,
    transferRate,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    companyFilter,
    dataSelection,
    dateFilter,
    productFilter,
    search,
    statusFilter,
    supplierFilter,
  ]);
  useEffect(() => {
    if (selectedId !== null && !tableRows.some((row) => row.id === selectedId)) setSelectedId(null);
  }, [selectedId, tableRows]);
  useEffect(() => {
    if (excelSelectionKey === null) return;
    const exists = excelFilteredRows.some((r) => excelPreviewRowKey(r) === excelSelectionKey);
    if (!exists) setSelectedExcelRow(null);
  }, [excelFilteredRows, excelSelectionKey]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  useEffect(() => {
    setTransferRate(exCurrent);
  }, [exCurrent]);
  useEffect(() => {
    if (!selectedRow || selectedRow.totalCny === null || selectedRow.totalCny === undefined) {
      setTransferQuantity(0);
      setTransferAmountCny(0);
      return;
    }
    const record = selectedId ? transferStates[selectedId] : undefined;
    const ratio = record?.remaining_paid_ratio ?? 0;
    setTransferQuantity(selectedRow.quantity * ratio);
    setTransferAmountCny(selectedRow.totalCny * 0.7 * ratio);
    setTransferPercent(ratio * 100);
    if (record?.applied_rate && record.applied_rate > 0) setTransferRate(record.applied_rate);
  }, [selectedId, selectedRow, transferStates]);

  useEffect(() => {
    if (!excelDialogOpen || companyFilter === null || dataSelection !== "excel") {
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setExcelHistoryLoading(true);
      setExcelHistoryError(null);
      try {
        const response = await fetch(
          `/api/orders/excel-upload-history?companyCode=${encodeURIComponent(companyFilter)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );
        const payload = (await response.json()) as {
          records?: ExcelUploadHistoryItem[];
          detail?: string;
          message?: string;
        };
        if (!response.ok) {
          setExcelHistoryError(payload.detail ?? payload.message ?? `HTTP ${response.status}`);
          return;
        }
        setExcelHistory(payload.records ?? []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const reason = error instanceof Error ? error.message : "네트워크 오류";
        setExcelHistoryError(reason);
      } finally {
        setExcelHistoryLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [companyFilter, dataSelection, excelDialogOpen, excelWs.importing, excelWs.statusMessage]);

  const loading = loadingPo || loadingMv || loadingSku;
  const errorMessage = errPo ?? errMv ?? errSku;

  const handleSyncErpPurchases = async () => {
    if (companyFilter === null) {
      setSyncMessage("기업을 먼저 선택하세요.");
      return;
    }
    setIsSyncingErp(true);
    setSyncMessage(null);
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      const response = await fetch("/api/orders/sync-erp-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: companyFilter,
          fromDate: from.toISOString().slice(0, 10),
          toDate: today.toISOString().slice(0, 10),
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        detail?: string;
        inserted?: number;
      };
      if (!response.ok) {
        setSyncMessage(`동기화 실패: ${payload.detail ?? payload.message ?? response.status}`);
        return;
      }
      await refetch();
      setSyncMessage(
        `${payload.message ?? "ERP 구매현황 동기화 완료"}${payload.inserted !== null && payload.inserted !== undefined ? ` (${payload.inserted}건)` : ""}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "네트워크 오류";
      setSyncMessage(`동기화 실패: ${message}`);
    } finally {
      setIsSyncingErp(false);
    }
  };

  const handlePrimarySyncButton = () => {
    if (dataSelection === "excel") {
      setExcelDialogOpen(true);
      return;
    }
    void handleSyncErpPurchases();
  };

  const handleSaveTransfer = async () => {
    setTransferMessage(null);
    if (!transferCalc) {
      setTransferMessage("송금 계산 결과가 없어 저장할 수 없습니다.");
      return;
    }
    const nextStatus =
      transferCalc.remainingProgressPercent >= 100
        ? "완료"
        : transferCalc.remainingProgressPercent > 0
          ? "진행"
          : "계약";
    if (!selectedId && selectedExcelRow !== null) {
      const key = excelPreviewRowKey(selectedExcelRow);
      setExcelStatusByRowKey((prev) => ({
        ...prev,
        [key]: nextStatus,
      }));
      setTransferMessage("상태가 저장되어 반영되었습니다.");
      return;
    }
    if (!selectedId) {
      setTransferMessage("주문 행을 선택한 뒤 저장할 수 있습니다.");
      return;
    }
    setIsSavingTransfer(true);
    try {
      const ratio = Math.max(0, Math.min(1, transferCalc.remainingProgressPercent / 100));
      const response = await fetch("/api/orders/transfer-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: selectedId,
          advancePaid: true,
          remainingPaidRatio: ratio,
          lastTransferQuantity: Math.round(transferCalc.normalizedTransferQty * 100) / 100,
          lastTransferAmountCny: Math.round(transferCalc.transferCny * 100) / 100,
          appliedRate: transferRate,
        }),
      });
      const payload = (await response.json()) as { message?: string; detail?: string };
      if (!response.ok) {
        // 변경 이유: 스키마 미적용 같은 백엔드 실패 원인을 화면에서 바로 확인할 수 있게 표시합니다.
        setTransferMessage(`저장 실패: ${payload.detail ?? payload.message ?? response.status}`);
        return;
      }
      setTransferStates((prev) => ({
        ...prev,
        [selectedId]: {
          advance_paid: true,
          remaining_paid_ratio: ratio,
          last_transfer_quantity: Math.round(transferCalc.normalizedTransferQty * 100) / 100,
          last_transfer_amount_cny: Math.round(transferCalc.transferCny * 100) / 100,
          applied_rate: transferRate,
          updated_at: new Date().toISOString(),
        },
      }));
      setTransferMessage(payload.message ?? "송금 기록이 저장되었습니다.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "네트워크 오류";
      setTransferMessage(`저장 실패: ${reason}`);
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const showExcelTable = dataSelection === "excel" && excelFilteredRows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="text-muted-foreground max-w-2xl text-sm">
          섹션1. 주문 관리 — 기업 선택, 자료선택(ERP/엑셀/합치기), 검색·필터, 송금기록(선금 30% +
          잔금 70%) 저장을 한 화면에서 처리합니다.
        </p>
        {/* 변경 이유: 환율값을 개별 배지 대신 한 박스 내 텍스트 2행으로 단순화해 요청한 레이아웃을 맞춥니다. */}
        <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
          <div className="font-mono text-xs leading-5">
            <p>CNY/KRW {exCurrent.toFixed(1)}</p>
            <p>USD/KRW {usdKrwRate > 0 ? usdKrwRate.toFixed(1) : "—"}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void fetchExchangeRate()}
            disabled={isRateLoading}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isRateLoading ? "animate-spin" : ""}`} />
            실시간 환율 조회
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{rateStatus}</p>
      {errorMessage ? (
        <p className="text-destructive text-sm">데이터 로드 오류: {errorMessage}</p>
      ) : null}

      <Card size="sm" className="overflow-visible">
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>기존 주문건 관리</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={companyFilter ?? "none"}
                onValueChange={(v) =>
                  setCompanyFilter(v === "none" ? null : (v as OrderCompanyCode))
                }
              >
                <SelectTrigger className="h-8 w-[170px]">
                  <SelectValue placeholder="기업 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">기업 선택</SelectItem>
                  {ORDER_COMPANIES.map((company) => (
                    <SelectItem key={company.code} value={company.code}>
                      {company.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={dataSelection}
                onValueChange={(v) => setDataSelection(v as DataSelection)}
                disabled={!isCompanySelected}
              >
                <SelectTrigger className="h-8 w-[170px]">
                  <SelectValue placeholder="자료 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="erp">ERP 연동</SelectItem>
                  <SelectItem value="excel">엑셀 업로드</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handlePrimarySyncButton}
                disabled={isSyncingErp || !isCompanySelected}
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${isSyncingErp ? "animate-spin" : ""}`} />
                {dataSelection === "excel" ? "엑셀 업로드 열기" : "ERP 구매현황 동기화"}
              </Button>
            </div>
          </div>
          <CardDescription>
            정렬: 최신순 / 나열: 10개 행 / 상태: 계약(선금 완료)-진행-완료(잔금 70% 완료)
          </CardDescription>
          {syncMessage ? <p className="text-muted-foreground text-xs">{syncMessage}</p> : null}
        </CardHeader>
        <CardContent className="pt-3">
          <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Select value={sortType} disabled>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">정렬: 최신순</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="품목코드·품목명·거래처·전표 검색"
              className="h-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={dateFilter}
                max={TODAY_MONTH}
                onChange={(e) =>
                  setDateFilter(
                    e.target.value && e.target.value > TODAY_MONTH ? TODAY_MONTH : e.target.value
                  )
                }
                className="h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setDateFilter("")}
              >
                전체
              </Button>
            </div>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="품목코드 및 품목명" />
              </SelectTrigger>
              <SelectContent>
                {productOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value === "전체" ? "품목: 전체" : option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="거래처" />
              </SelectTrigger>
              <SelectContent>
                {supplierOptions.map((supplier) => (
                  <SelectItem key={supplier} value={supplier}>
                    {supplier === "전체" ? "거래처: 전체" : supplier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "전체" | PaymentStatus)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">상태: 전체</SelectItem>
                <SelectItem value="계약">상태: 계약</SelectItem>
                <SelectItem value="진행">상태: 진행</SelectItem>
                <SelectItem value="완료">상태: 완료</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {showExcelTable ? (
                <OrderExcelPreviewTable
                  rows={excelFilteredRows}
                  emptyHint="선택한 조건의 엑셀 데이터가 없습니다."
                  selectedKey={excelSelectionKey}
                  statusByRowKey={excelStatusByRowKey}
                  onSelectRow={(row) => {
                    setSelectedId(null);
                    setSelectedExcelRow(row);
                  }}
                />
              ) : tableRows.length > 0 ? (
                <>
                  <OrderTable
                    rows={pagedRows}
                    selectedId={selectedId}
                    onSelectRow={(id) => {
                      setSelectedExcelRow(null);
                      setSelectedId(id);
                    }}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">
                      기업 {companyFilter ? companyLabel(companyFilter) : "미선택"} · 총{" "}
                      {tableRows.length.toLocaleString("ko-KR")}건 · 페이지 {currentPage}/
                      {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                      >
                        이전
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        다음
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <OrderExcelPreviewTable
                  rows={excelFilteredRows}
                  emptyHint={
                    companyFilter === null
                      ? "상단에서 기업을 먼저 선택한 후, ERP 연동 또는 엑셀 업로드를 선택하세요."
                      : "조건에 맞는 주문 데이터가 없습니다. ERP 동기화 또는 엑셀 업로드를 진행하세요."
                  }
                  selectedKey={excelSelectionKey}
                  statusByRowKey={excelStatusByRowKey}
                  onSelectRow={(row) => {
                    setSelectedId(null);
                    setSelectedExcelRow(row);
                  }}
                />
              )}

              <p className="text-muted-foreground border-t pt-3 text-xs">
                {dataSelection === "excel" ? (
                  <>
                    엑셀 업로드는 상단의 <span className="font-medium">엑셀 업로드 열기</span>{" "}
                    버튼에서 진행합니다.
                  </>
                ) : (
                  <>
                    엑셀 작업은 상단 자료 선택을 <span className="font-medium">엑셀 업로드</span>로
                    변경하면 사용할 수 있습니다.
                  </>
                )}
              </p>

              <OrderContractAddForm
                selectedCompanyCode={companyFilter}
                onAdded={() => void refetch()}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={excelDialogOpen} onOpenChange={setExcelDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>엑셀 업로드 이력 및 신규 업로드</DialogTitle>
            <DialogDescription>
              기업 {companyFilter ? companyLabel(companyFilter) : "미선택"}의 이전 업로드 기록을
              확인하고 새 엑셀 파일을 반영합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs font-medium">이전 업로드 기록</p>
            <div className="max-h-44 overflow-y-auto rounded-md border">
              {excelHistoryLoading ? (
                <p className="text-muted-foreground px-3 py-4 text-xs">이력 불러오는 중...</p>
              ) : excelHistoryError ? (
                <p className="text-destructive px-3 py-4 text-xs">
                  이력 조회 실패: {excelHistoryError}
                </p>
              ) : excelHistory.length === 0 ? (
                <p className="text-muted-foreground px-3 py-4 text-xs">업로드 기록이 없습니다.</p>
              ) : (
                <ul className="divide-y text-xs">
                  {excelHistory.map((item) => (
                    <li
                      key={`${item.created_at}-${item.file_name}`}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.file_name}</p>
                        <p className="text-muted-foreground">
                          {new Date(item.created_at).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <p className="text-muted-foreground whitespace-nowrap">
                        입력 {item.total_input} · 신규 {item.inserted_count} · 건너뜀{" "}
                        {item.skipped_count}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <OrderExcelActionBar
            fileRef={excelWs.fileRef}
            sampleLoading={excelWs.sampleLoading}
            importing={excelWs.importing}
            statusMessage={excelWs.statusMessage}
            parseErrors={excelWs.parseErrors}
            onPickFile={excelWs.onPickFile}
            onLoadSample={() => void excelWs.loadSample()}
            onImport={() => void excelWs.handleImport()}
            onDownloadAll={excelWs.handleDownloadAll}
          />
        </DialogContent>
      </Dialog>

      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>송금 기록 (선금 30% · 잔액 70%)</CardTitle>
          <CardDescription>
            리스트에서 선택한 주문 기준으로 송금 수량 또는 금액을 입력하고 저장하면 다른 웹에서도
            동일 상태가 동기화됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          {selectedRow ? (
            <>
              <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">기업</p>
                  <p className="font-medium">{companyLabel(selectedRow.companyCode)}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">일자 · 전표</p>
                  <p className="font-mono">
                    {selectedRow.purchaseDate} · {selectedRow.orderRef}
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">계약 수량</p>
                  <p className="font-medium">{selectedRow.quantity.toLocaleString("ko-KR")}개</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-muted-foreground text-xs">계약 총액(CNY)</p>
                  <p className="font-medium">
                    {selectedRow.totalCny !== null && selectedRow.totalCny !== undefined
                      ? selectedRow.totalCny.toLocaleString("ko-KR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs">현재 환율(CNY/KRW)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={transferRate}
                    onChange={(e) =>
                      setTransferRate(
                        Number.isFinite(Number(e.target.value)) && Number(e.target.value) > 0
                          ? Number(e.target.value)
                          : 0
                      )
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs">송금 입력 방식</span>
                  <Select
                    value={transferMode}
                    onValueChange={(v) => setTransferMode(v as TransferMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quantity">수량 기준</SelectItem>
                      <SelectItem value="amount">금액 기준(CNY)</SelectItem>
                      <SelectItem value="percent">% 기준(잔금 70%)</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {transferMode === "quantity" ? (
                  <label className="space-y-1">
                    <span className="text-muted-foreground text-xs">이번 송금 수량(개)</span>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      max={selectedRow.quantity}
                      value={transferQuantity}
                      onChange={(e) =>
                        setTransferQuantity(
                          Number.isFinite(Number(e.target.value))
                            ? Math.max(0, Math.min(selectedRow.quantity, Number(e.target.value)))
                            : 0
                        )
                      }
                    />
                  </label>
                ) : transferMode === "amount" ? (
                  <label className="space-y-1">
                    <span className="text-muted-foreground text-xs">이번 송금 금액(CNY)</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={transferAmountCny}
                      onChange={(e) =>
                        setTransferAmountCny(
                          Number.isFinite(Number(e.target.value)) && Number(e.target.value) >= 0
                            ? Number(e.target.value)
                            : 0
                        )
                      }
                    />
                  </label>
                ) : (
                  <label className="space-y-1">
                    <span className="text-muted-foreground text-xs">
                      이번 송금 비율(%, 잔금 70% 기준)
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={transferPercent}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setTransferPercent(
                          Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0
                        );
                      }}
                    />
                  </label>
                )}
                <div className="flex items-end">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void handleSaveTransfer()}
                    disabled={isSavingTransfer || !selectedRow || !transferCalc}
                  >
                    <Save className="mr-1 h-4 w-4" />
                    {isSavingTransfer ? "저장 중..." : "송금 기록 저장"}
                  </Button>
                </div>
              </div>

              {transferCalc ? (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">송금 계산 결과</p>
                  <p className="text-muted-foreground mt-1">
                    선금 30%:{" "}
                    {transferCalc.advancePaidCny.toLocaleString("ko-KR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    CNY / 잔금 70%:{" "}
                    {transferCalc.remainingCny.toLocaleString("ko-KR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    CNY
                  </p>
                  <p className="mt-2">
                    이번 송금 수량:{" "}
                    {transferCalc.normalizedTransferQty.toLocaleString("ko-KR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    개
                  </p>
                  <p className="mt-1">
                    이번 송금 금액:{" "}
                    <span className="font-semibold">
                      {transferCalc.transferCny.toLocaleString("ko-KR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      CNY
                    </span>
                  </p>
                  <p className="mt-1">
                    이번 송금 원화:{" "}
                    <span className="font-semibold">
                      ₩{Math.round(transferCalc.transferKrw).toLocaleString("ko-KR")}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    잔금 70% 진행률 {transferCalc.remainingProgressPercent.toFixed(1)}% / 총액
                    진행률 {transferCalc.totalProgressPercent.toFixed(1)}%
                  </p>
                  <div className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full bg-sky-500 transition-all"
                      style={{ width: `${transferCalc.totalProgressPercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  선택 주문의 단가/합계 데이터가 없어 송금 계산을 진행할 수 없습니다.
                </p>
              )}
              {transferMessage ? (
                <p className="text-muted-foreground text-xs">{transferMessage}</p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              주문 행을 선택하면 송금 계산 및 저장이 활성화됩니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
