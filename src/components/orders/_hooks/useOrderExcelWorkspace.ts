"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  downloadPurchaseExcel,
  parsePurchaseExcelBuffer,
  type PurchaseExcelParsedRow,
  type PurchaseRowForExport,
} from "@/lib/orders/purchaseExcel";
import {
  companyLabel,
  parseOrderSource,
  sourceKindLabel,
  type OrderCompanyCode,
} from "@/lib/orders/orderMeta";
import type { PurchaseDashboardRow } from "./buildContractRows";

const SAMPLE_URL = "/orders-sample/제출용-입출고자료.xlsx";

function remarkFromSource(source: string | null): string {
  const parsed = parseOrderSource(source);
  return `${companyLabel(parsed.companyCode)} · ${sourceKindLabel(parsed.kind)}`;
}

/** v_orders_dashboard purchase 행을 엑셀 export 포맷으로 변환 */
export function purchasesToExportRows(list: PurchaseDashboardRow[]): PurchaseRowForExport[] {
  return list.map((p) => ({
    erp_ref: p.erp_tx_no ?? String(p.order_id ?? ""),
    purchase_date: p.tx_date ?? "",
    erp_code: p.erp_code ?? "",
    erp_product_name: p.item_name ?? p.erp_item_name_raw ?? "",
    quantity: p.quantity ?? 0,
    unit_price: p.unit_price !== null && p.unit_price !== undefined ? Number(p.unit_price) : null,
    amount: p.total_amount !== null && p.total_amount !== undefined ? Number(p.total_amount) : null,
    supplier_name: p.counterparty,
    remark: remarkFromSource(p.memo ?? null),
  }));
}

/** 제출용 구매현황 엑셀 — 미리보기 상태·가져오기·다운로드 (카드 내부 배치용) */
export function useOrderExcelWorkspace(
  purchases: PurchaseDashboardRow[],
  selectedCompanyCode: OrderCompanyCode | null,
  onImported: () => void
) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<PurchaseExcelParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const applyBuffer = useCallback((buffer: ArrayBuffer) => {
    const { rows, errors } = parsePurchaseExcelBuffer(buffer);
    setPreviewRows(rows);
    setParseErrors(errors);
    setStatusMessage(
      errors.length > 0
        ? `파싱 경고 ${errors.length}건(요약·빈 행 등). 데이터 ${rows.length}건 표시.`
        : `데이터 ${rows.length}건을 불러왔습니다.`
    );
  }, []);

  const loadSample = useCallback(async () => {
    setSampleLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) {
        setStatusMessage(`샘플 파일을 불러오지 못했습니다 (HTTP ${res.status}).`);
        return;
      }
      const buf = await res.arrayBuffer();
      applyBuffer(buf);
      setSelectedFileName("제출용-입출고자료.xlsx");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "네트워크 오류";
      setStatusMessage(`샘플 로드 실패: ${msg}`);
    } finally {
      setSampleLoading(false);
    }
  }, [applyBuffer]);

  // 마운트 시 1회만 샘플 로드 (loadSample 재생성 시 재로드 방지)
  // loadSample을 ref로 안정화해 deps에서 제외
  const loadSampleRef = useRef(loadSample);
  useEffect(() => {
    loadSampleRef.current = loadSample;
  }, [loadSample]);
  useEffect(() => {
    void loadSampleRef.current();
  }, []);

  const onPickFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setStatusMessage(null);
    setSelectedFileName(file.name);
    const buf = await file.arrayBuffer();
    applyBuffer(buf);
  };

  const handleImport = async () => {
    if (selectedCompanyCode === null) {
      setStatusMessage("먼저 기업을 선택하세요.");
      return;
    }
    if (previewRows.length === 0) {
      setStatusMessage("가져올 데이터가 없습니다.");
      return;
    }
    setImporting(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/orders/bulk-import-purchase-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: selectedCompanyCode,
          fileName: selectedFileName,
          rows: previewRows.map((r) => ({
            erpRef: r.erpRef,
            purchaseDateIso: r.purchaseDateIso,
            erpCode: r.erpCode,
            productName: r.productName,
            quantity: r.quantity,
            unitPriceCny: r.unitPriceCny,
            totalCny: r.totalCny,
            supplierName: r.supplierName,
          })),
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        detail?: string;
        inserted?: number;
        skipped?: number;
        unmapped?: number;
      };
      if (!response.ok) {
        const reason =
          payload.error ?? payload.detail ?? payload.message ?? `HTTP ${response.status}`;
        setStatusMessage(`저장 실패: ${reason}`);
        return;
      }
      const extra = payload.unmapped ? ` · 품목매핑 누락 ${payload.unmapped}건` : "";
      setStatusMessage(
        `${payload.message ?? "완료"} — 신규 ${payload.inserted ?? 0}건, 건너뜀(기존 전표) ${payload.skipped ?? 0}건${extra}`
      );
      onImported();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "네트워크 오류";
      setStatusMessage(`저장 실패: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadAll = () => {
    if (purchases.length === 0) {
      setStatusMessage("다운로드할 DB 계약건이 없습니다.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadPurchaseExcel(purchasesToExportRows(purchases), `구매현황_전체_${stamp}.xlsx`);
    setStatusMessage(`DB 계약 ${purchases.length}건을 엑셀로 저장했습니다.`);
  };

  return {
    fileRef,
    previewRows,
    parseErrors,
    sampleLoading,
    importing,
    statusMessage,
    selectedFileName,
    loadSample,
    onPickFile,
    handleImport,
    handleDownloadAll,
  };
}
