"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OrderExcelActionBar from "./OrderExcelActionBar";
import OrderExcelPreviewTable from "./OrderExcelPreviewTable";
import { useOrderExcelWorkspace } from "./_hooks/useOrderExcelWorkspace";
import type { OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { Tables } from "@/lib/supabase/types";
import type { PurchaseDashboardRow } from "./_hooks/buildContractRows";

type UploadLog = Pick<
  Tables<"order_excel_upload_logs">,
  | "id"
  | "company_code"
  | "file_name"
  | "total_input"
  | "inserted_count"
  | "skipped_count"
  | "created_at"
>;

interface Props {
  companyCode: OrderCompanyCode | null;
  purchases: PurchaseDashboardRow[];
  onImported: () => void;
}

/** 엑셀 업로드 팝업 (다이얼로그) — 미리보기 + 이력 조회 */
export function OrdersExcelUploadDialog({ companyCode, purchases, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<UploadLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const {
    fileRef,
    previewRows,
    parseErrors,
    sampleLoading,
    importing,
    statusMessage,
    loadSample,
    onPickFile,
    handleImport,
    handleDownloadAll,
  } = useOrderExcelWorkspace(purchases, companyCode, () => {
    onImported();
    void refetchHistory();
  });

  const refetchHistory = async () => {
    if (!companyCode || !open) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/orders/excel-upload-history?companyCode=${companyCode}`);
      const payload = (await res.json()) as { logs?: UploadLog[]; error?: string };
      if (res.ok && payload.logs) setHistory(payload.logs);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (open && companyCode) void refetchHistory();
  }, [open, companyCode]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-1 h-4 w-4" />
          엑셀 업로드
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>구매 엑셀 업로드</DialogTitle>
          <DialogDescription>
            {companyCode
              ? `${companyCode} — 파일 선택 후 미리보기 확인 → "DB 반영"으로 승인대기 상태로 저장`
              : "먼저 상단에서 기업을 선택하세요."}
          </DialogDescription>
        </DialogHeader>

        {companyCode ? (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">최근 업로드 이력</p>
              {historyLoading ? (
                <p className="text-muted-foreground text-xs">불러오는 중…</p>
              ) : history.length === 0 ? (
                <p className="text-muted-foreground text-xs">이력 없음</p>
              ) : (
                <ul className="max-h-24 space-y-1 overflow-y-auto text-xs">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {h.company_code}
                      </Badge>
                      <span className="line-clamp-1 flex-1">{h.file_name}</span>
                      <span className="text-muted-foreground">
                        +{h.inserted_count} / −{h.skipped_count}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("ko-KR")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <OrderExcelPreviewTable rows={previewRows} />
            <OrderExcelActionBar
              fileRef={fileRef}
              sampleLoading={sampleLoading}
              importing={importing}
              statusMessage={statusMessage}
              parseErrors={parseErrors}
              onPickFile={onPickFile}
              onLoadSample={loadSample}
              onImport={handleImport}
              onDownloadAll={handleDownloadAll}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
