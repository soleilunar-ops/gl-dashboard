"use client";

import { useCallback, useRef, useState } from "react";
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

/** 제출용 구매현황 엑셀 — 파싱·업로드·다운로드 */
export function useOrderExcelWorkspace(
  purchases: PurchaseDashboardRow[],
  selectedCompanyCode: OrderCompanyCode | null,
  onImported: () => void,
  /** 변경 이유: 파일 선택 직후 서버 이력 반영 시 목록 새로고침 */
  onUploadRegistered?: () => void
) {
  const fileRef = useRef<HTMLInputElement>(null);
  /** 사용자가 디스크에서 선택한 원본 파일 — 변경 이유: 서버 Storage 보관용 multipart 업로드 */
  const pickedFileRef = useRef<File | null>(null);
  /** DB 반영용 파싱 결과 */
  const [parsedRows, setParsedRows] = useState<PurchaseExcelParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  /** 변경 이유: excel-upload-register로 만든 행과 bulk-import 갱신을 연결 */
  const [pendingUploadLogId, setPendingUploadLogId] = useState<string | null>(null);

  const applyBuffer = useCallback((buffer: ArrayBuffer) => {
    const { rows, errors } = parsePurchaseExcelBuffer(buffer);
    setParsedRows(rows);
    setParseErrors(errors);
    setStatusMessage(
      errors.length > 0
        ? `파싱 경고 ${errors.length}건(요약·빈 행 등). 데이터 ${rows.length}건 불러왔습니다.`
        : `데이터 ${rows.length}건을 불러왔습니다.`
    );
  }, []);

  const onPickFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    setStatusMessage(null);
    pickedFileRef.current = file;
    setSelectedFileName(file.name);
    setPendingUploadLogId(null);
    const buf = await file.arrayBuffer();
    applyBuffer(buf);

    if (selectedCompanyCode === null) {
      return;
    }

    try {
      const fd = new FormData();
      fd.append("companyCode", selectedCompanyCode);
      fd.append("file", file);
      const res = await fetch("/api/orders/excel-upload-register", { method: "POST", body: fd });
      const data = (await res.json()) as { logId?: string; error?: string };
      if (res.ok && data.logId) {
        setPendingUploadLogId(data.logId);
        onUploadRegistered?.();
      } else {
        setStatusMessage(
          (prev) =>
            `${prev ?? ""}${prev ? " · " : ""}원본 서버 보관 실패(${data.error ?? String(res.status)}) — 「업로드」 시 파일을 함께 전송합니다.`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "네트워크 오류";
      setStatusMessage(
        (prev) =>
          `${prev ?? ""}${prev ? " · " : ""}원본 서버 보관 오류: ${msg} — 「업로드」 시 파일을 함께 전송합니다.`
      );
    }
  };

  const handleImport = async () => {
    if (selectedCompanyCode === null) {
      setStatusMessage("먼저 기업을 선택하세요.");
      return;
    }
    if (parsedRows.length === 0) {
      setStatusMessage("가져올 데이터가 없습니다.");
      return;
    }
    setImporting(true);
    setStatusMessage(null);
    try {
      const basePayload = {
        companyCode: selectedCompanyCode,
        fileName: selectedFileName,
        rows: parsedRows.map((r) => ({
          erpRef: r.erpRef,
          purchaseDateIso: r.purchaseDateIso,
          erpCode: r.erpCode,
          productName: r.productName,
          quantity: r.quantity,
          unitPriceCny: r.unitPriceCny,
          totalCny: r.totalCny,
          supplierName: r.supplierName,
        })),
      };

      const useRegistered = pendingUploadLogId !== null;
      const payloadObj =
        useRegistered && pendingUploadLogId
          ? { ...basePayload, uploadLogId: pendingUploadLogId }
          : basePayload;

      const picked = pickedFileRef.current;
      const response =
        useRegistered && pendingUploadLogId
          ? await fetch("/api/orders/bulk-import-purchase-excel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payloadObj),
            })
          : picked !== null
            ? await fetch("/api/orders/bulk-import-purchase-excel", {
                method: "POST",
                body: (() => {
                  const fd = new FormData();
                  fd.append("payload", JSON.stringify(payloadObj));
                  fd.append("file", picked);
                  return fd;
                })(),
              })
            : await fetch("/api/orders/bulk-import-purchase-excel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payloadObj),
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
      setPendingUploadLogId(null);
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
    parseErrors,
    importing,
    statusMessage,
    selectedFileName,
    onPickFile,
    handleImport,
    handleDownloadAll,
  };
}
