"use client";

/**

 * 사용자 직접 첨부 구매 엑셀 — 이력·원본 재다운로드(Storage), DB 반영은 별개 흐름

 * 변경 이유: ERP 연동과 무관하게 파일 이력·저장 파일 받기 요구 반영

 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Download, Upload } from "lucide-react";

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

import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import OrderExcelActionBar from "./OrderExcelActionBar";

import { useOrderExcelWorkspace } from "./_hooks/useOrderExcelWorkspace";

import type { OrderCompanyCode } from "@/lib/orders/orderMeta";

import { ORDER_COMPANIES, companyLabel } from "@/lib/orders/orderMeta";

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
  | "storage_path"
>;

interface Props {
  companyCode: OrderCompanyCode | null;

  purchases: PurchaseDashboardRow[];

  onImported: () => void;

  /** DialogTrigger 버튼 스타일(한 줄 배치 시 h-9 등) */

  triggerClassName?: string;
}

export function OrdersExcelUploadDialog({
  companyCode,

  purchases,

  onImported,

  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);

  const [history, setHistory] = useState<UploadLog[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  /** 상단에서 기업 미선택 시 엑셀 반영 대상 기업 — 변경 이유: 버튼은 항상 열림 */

  const [importTargetCompany, setImportTargetCompany] = useState<OrderCompanyCode>("gl");

  useEffect(() => {
    if (companyCode) {
      setImportTargetCompany(companyCode);
    }
  }, [companyCode]);

  const workspaceCompany = companyCode ?? importTargetCompany;

  const refetchHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const qs = companyCode ? `companyCode=${companyCode}` : "scope=all";

      const res = await fetch(`/api/orders/excel-upload-history?${qs}`);

      const payload = (await res.json()) as { logs?: UploadLog[]; error?: string };

      if (res.ok && payload.logs) setHistory(payload.logs);
    } finally {
      setHistoryLoading(false);
    }
  }, [companyCode]);

  const {
    fileRef,

    parseErrors,

    importing,

    statusMessage,

    onPickFile,

    handleImport,

    handleDownloadAll,
  } = useOrderExcelWorkspace(
    purchases,
    workspaceCompany,
    () => {
      onImported();

      void refetchHistory();
    },
    () => {
      void refetchHistory();
    }
  );

  useEffect(() => {
    if (open) void refetchHistory();
  }, [open, refetchHistory]);

  const historyTitle = useMemo(
    () => (companyCode ? `${companyLabel(companyCode)} 업로드 이력` : "업로드 이력 (전체 기업)"),

    [companyCode]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={triggerClassName}>
          <Upload className="mr-1 h-4 w-4" />
          엑셀 업로드
        </Button>
      </DialogTrigger>

      {/* 변경 이유: dialog 기본 sm:max-w-sm(384px)을 sm:max-w-7xl로 덮어 가로 확장 */}
      <DialogContent className="max-h-[min(90vh,920px)] w-full gap-4 overflow-y-auto sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>직접 첨부 엑셀</DialogTitle>

          <DialogDescription>
            ERP 크롤과 무관하게 제출용 구매 양식을 올립니다. 파일 선택 시 원본이 서버에 보관되며
            아래 표에 쌓이고, 「업로드」로 DB에 반영됩니다. 표에서 이전 원본을 다시 받을 수
            있습니다.
            {companyCode
              ? ` 업로드 기업: ${companyLabel(companyCode)}.`
              : " 상단에서 기업 한 개만 선택하면 해당 기업으로 고정되고, 그렇지 않으면 아래에서 반영 기업을 선택합니다."}
          </DialogDescription>
        </DialogHeader>

        {!companyCode ? (
          <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <Label htmlFor="excel-import-company" className="text-xs whitespace-nowrap">
              업로드 기업
            </Label>

            <Select
              value={importTargetCompany}
              onValueChange={(v) => setImportTargetCompany(v as OrderCompanyCode)}
            >
              <SelectTrigger id="excel-import-company" className="h-9 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {ORDER_COMPANIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            업로드 기업:{" "}
            <span className="text-foreground font-medium">{companyLabel(companyCode)}</span>
          </p>
        )}

        {/* 변경 이유: 파일 선택·업로드를 한 줄에 두어 하단과 동작 중복 제거 */}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;

              void onPickFile(f);

              e.target.value = "";
            }}
          />

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            파일 선택
          </Button>

          <Button type="button" size="sm" onClick={() => void handleImport()} disabled={importing}>
            {importing ? "업로드 중…" : "업로드"}
          </Button>

          <p className="text-muted-foreground text-[11px]">
            .xlsx / .xls · 파싱 후 「업로드」로 DB에 반영합니다.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{historyTitle}</p>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[76px] text-xs">기업</TableHead>

                  <TableHead className="min-w-[120px] text-xs">파일명</TableHead>

                  <TableHead className="w-[100px] text-center text-xs whitespace-nowrap">
                    다운로드
                  </TableHead>

                  <TableHead className="w-[52px] text-right text-xs">입력</TableHead>

                  <TableHead className="w-[52px] text-right text-xs">신규</TableHead>

                  <TableHead className="w-[52px] text-right text-xs">건너뜀</TableHead>

                  <TableHead className="min-w-[148px] text-xs">일시</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {historyLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground py-6 text-center text-xs"
                    >
                      불러오는 중…
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground py-6 text-center text-xs"
                    >
                      저장된 업로드 이력이 없습니다. 파일을 선택하면 여기에 표시됩니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {h.company_code}
                        </Badge>
                      </TableCell>

                      <TableCell className="max-w-[240px] py-2">
                        <span className="line-clamp-2 text-xs">{h.file_name}</span>
                      </TableCell>

                      <TableCell className="py-2 text-center">
                        {h.storage_path ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            asChild
                          >
                            <a
                              href={`/api/orders/excel-upload-download?logId=${encodeURIComponent(h.id)}`}
                              download={h.file_name}
                              title={`${h.file_name} 다운로드`}
                            >
                              <Download className="mr-1 inline size-3.5" />
                              받기
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2 text-right text-xs tabular-nums">
                        {h.total_input ?? "—"}
                      </TableCell>

                      <TableCell className="py-2 text-right text-xs tabular-nums">
                        +{h.inserted_count ?? 0}
                      </TableCell>

                      <TableCell className="py-2 text-right text-xs tabular-nums">
                        {h.skipped_count ?? 0}
                      </TableCell>

                      <TableCell className="text-muted-foreground py-2 text-[11px] whitespace-nowrap">
                        {new Date(h.created_at).toLocaleString("ko-KR")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <OrderExcelActionBar
          statusMessage={statusMessage}
          parseErrors={parseErrors}
          onDownloadAll={handleDownloadAll}
        />
      </DialogContent>
    </Dialog>
  );
}
