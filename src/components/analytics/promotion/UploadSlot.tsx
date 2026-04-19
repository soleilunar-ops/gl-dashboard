"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import ExcelUploader from "@/components/shared/ExcelUploader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import type { ParsedDailyPerformanceRow } from "@/lib/excel-parsers/parseDailyPerformance";
import type { ParsedDeliveryRow } from "@/lib/excel-parsers/parseDeliveryDetail";
import type { ParsedCouponContractRow } from "@/lib/excel-parsers/parseCouponContracts";
import type { ParsedMilkrunRow } from "@/lib/excel-parsers/parseMilkrunCosts";
import { detectUploadKind, type UploadKind } from "@/lib/upload/detectUploadKind";
import {
  countOverlappingDaily,
  countOverlappingDelivery,
  countOverlappingMilkrun,
} from "@/lib/upload/overlapQueries";
import type { UploadConflictMode, UploadResult } from "@/lib/upload/uploadTypes";
import { uploadCouponContracts } from "@/lib/uploadHandlers/uploadCouponContracts";
import { uploadDailyPerformance } from "@/lib/uploadHandlers/uploadDailyPerformance";
import { uploadDeliveryDetail } from "@/lib/uploadHandlers/uploadDeliveryDetail";
import { uploadMilkrunCosts } from "@/lib/uploadHandlers/uploadMilkrunCosts";
import { cn } from "@/lib/utils";

export type UploadSlotProps = {
  title: string;
  hubHint: string;
  accent: "blue" | "green" | "yellow" | "purple";
  uploadKind: UploadKind;
  expectedColumns: string[];
  accept: "csv" | "xlsx" | ("csv" | "xlsx")[];
  parser: (file: File) => Promise<Record<string, unknown>[]>;
  onUploaded?: () => void;
};

const accentRing: Record<UploadSlotProps["accent"], string> = {
  blue: "ring-blue-500/30 border-blue-500/40",
  green: "ring-green-600/30 border-green-600/40",
  yellow: "ring-amber-400/40 border-amber-500/40",
  purple: "ring-violet-500/30 border-violet-500/40",
};

function previewRows(rows: Record<string, unknown>[], max = 5): Record<string, unknown>[] {
  return rows.slice(0, max);
}

export default function UploadSlot({
  title,
  hubHint,
  accent,
  uploadKind,
  expectedColumns,
  accept,
  parser,
  onUploaded,
}: UploadSlotProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [overlapOpen, setOverlapOpen] = useState(false);
  const [overlapCount, setOverlapCount] = useState(0);
  const [pendingMode, setPendingMode] = useState<UploadConflictMode>("replace");
  const [uploading, setUploading] = useState(false);

  const summary = useMemo(() => {
    if (!rows?.length) return null;
    if (uploadKind === "daily_performance") {
      const ds = (rows as ParsedDailyPerformanceRow[]).map((r) => r.date).sort();
      const gmv = (rows as ParsedDailyPerformanceRow[]).reduce(
        (s, r) => s + (Number(r.gmv) || 0),
        0
      );
      return {
        label: "GMV 합계",
        period: `${ds[0]} ~ ${ds[ds.length - 1]}`,
        value: gmv.toLocaleString("ko-KR") + "원",
      };
    }
    if (uploadKind === "delivery_detail") {
      const ds = (rows as ParsedDeliveryRow[]).map((r) => r.delivery_date).sort();
      const q = (rows as ParsedDeliveryRow[]).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      return { label: "수량 합계", period: `${ds[0]} ~ ${ds[ds.length - 1]}`, value: String(q) };
    }
    if (uploadKind === "milkrun") {
      const yms = [...new Set((rows as ParsedMilkrunRow[]).map((r) => r.year_month))].sort();
      const amt = (rows as ParsedMilkrunRow[]).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      return {
        label: "금액 합계",
        period: yms.join(", "),
        value: amt.toLocaleString("ko-KR") + "원",
      };
    }
    if (uploadKind === "coupon") {
      const n = rows.length;
      return { label: "계약 건수", period: "—", value: `${n}건` };
    }
    return null;
  }, [rows, uploadKind]);

  const checkOverlap = useCallback(
    async (parsed: Record<string, unknown>[]) => {
      if (!parsed.length || uploadKind === "coupon") return 0;
      const supabase = createClient();
      if (uploadKind === "daily_performance") {
        const ds = (parsed as ParsedDailyPerformanceRow[]).map((r) => r.date).sort();
        return countOverlappingDaily(supabase, ds[0]!, ds[ds.length - 1]!);
      }
      if (uploadKind === "delivery_detail") {
        const ds = (parsed as ParsedDeliveryRow[]).map((r) => r.delivery_date).sort();
        return countOverlappingDelivery(supabase, ds[0]!, ds[ds.length - 1]!);
      }
      if (uploadKind === "milkrun") {
        const yms = [...new Set((parsed as ParsedMilkrunRow[]).map((r) => r.year_month))];
        return countOverlappingMilkrun(supabase, yms);
      }
      return 0;
    },
    [uploadKind]
  );

  const handleParsed = useCallback(
    async (parsed: Record<string, unknown>[], file: File) => {
      const detected = detectUploadKind(file.name);
      if (detected !== uploadKind) {
        toast.error(
          "파일명이 이 영역과 맞지 않습니다. 안내에 맞는 접두사(daily_performance, Coupang_Stocked, coupon, milkrun)를 확인해 주세요."
        );
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      if (uploadKind === "coupon") {
        setOverlapCount(0);
        return;
      }
      try {
        const c = await checkOverlap(parsed);
        setOverlapCount(c);
        if (c > 0) setOverlapOpen(true);
      } catch {
        setOverlapCount(0);
      }
    },
    [checkOverlap, uploadKind]
  );

  const runUpload = async (mode: UploadConflictMode) => {
    if (!rows?.length) return;
    setUploading(true);
    const supabase = createClient();
    let res: UploadResult;
    try {
      if (uploadKind === "daily_performance") {
        res = await uploadDailyPerformance(
          supabase,
          rows as ParsedDailyPerformanceRow[],
          mode,
          fileName || "daily_performance.csv"
        );
      } else if (uploadKind === "delivery_detail") {
        res = await uploadDeliveryDetail(
          supabase,
          rows as ParsedDeliveryRow[],
          mode,
          fileName || "delivery.xlsx"
        );
      } else if (uploadKind === "milkrun") {
        res = await uploadMilkrunCosts(
          supabase,
          rows as ParsedMilkrunRow[],
          mode,
          fileName || "milkrun.xls"
        );
      } else {
        res = await uploadCouponContracts(
          supabase,
          rows as ParsedCouponContractRow[],
          fileName || "coupon.xls"
        );
      }
      if (res.errors.length) {
        toast.error(res.errors.join("\n"));
      } else {
        toast.success(`저장 완료: ${res.inserted + res.updated}건 처리되었습니다.`);
      }
      setRows(null);
      setOverlapOpen(false);
      onUploaded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const previewKeys = rows?.length ? Object.keys(rows[0] ?? {}).slice(0, 8) : [];

  return (
    <section
      className={cn("bg-card space-y-3 rounded-xl border p-4 shadow-sm ring-1", accentRing[accent])}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-muted-foreground text-xs">{hubHint}</p>
        </div>
        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
          이번 주 완료
        </span>
      </div>

      <ExcelUploader
        accept={accept}
        expectedColumns={expectedColumns}
        parser={parser}
        onParsed={handleParsed}
        onError={(msg) => toast.error(msg)}
      />

      {rows && summary && (
        <div className="bg-muted/20 space-y-2 rounded-lg border p-3 text-sm">
          <p>
            <span className="text-muted-foreground">행 수:</span>{" "}
            {rows.length.toLocaleString("ko-KR")} ·{" "}
            <span className="text-muted-foreground">기간:</span> {summary.period} ·{" "}
            <span className="text-muted-foreground">{summary.label}:</span> {summary.value}
          </p>
          <div className="bg-background max-h-[200px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {previewKeys.map((k) => (
                    <TableHead key={k} className="text-xs whitespace-nowrap">
                      {k}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows(rows).map((r, i) => (
                  <TableRow key={i}>
                    {previewKeys.map((k) => (
                      <TableCell key={k} className="max-w-[140px] truncate text-xs">
                        {String(r[k] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap gap-2">
            {overlapCount > 0 && uploadKind !== "coupon" && (
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => setOverlapOpen(true)}
              >
                겹침 {overlapCount}건 · 처리 방식
              </Button>
            )}
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => void runUpload(overlapCount > 0 ? pendingMode : "replace")}
            >
              확정
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRows(null)} disabled={uploading}>
              취소
            </Button>
          </div>
        </div>
      )}

      <Dialog open={overlapOpen} onOpenChange={setOverlapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기존 데이터와 기간이 겹칩니다</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            동일 기간에 이미 올라온 라이브 데이터가 {overlapCount}건 있습니다. 덮어쓰면 해당
            기간(또는 월) 데이터가 삭제된 뒤 새 파일로 다시 들어갑니다.
          </p>
          <RadioGroup
            value={pendingMode}
            onValueChange={(v) => setPendingMode(v as UploadConflictMode)}
            className="flex flex-row gap-4 py-2"
          >
            <label
              htmlFor="mode-replace"
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <RadioGroupItem value="replace" id="mode-replace" />
              덮어쓰기
            </label>
            <label htmlFor="mode-skip" className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="skip" id="mode-skip" />
              겹치는 행만 건너뛰기
            </label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverlapOpen(false)}>
              닫기
            </Button>
            <Button
              onClick={() => {
                setOverlapOpen(false);
                void runUpload(pendingMode);
              }}
            >
              이 방식으로 진행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
