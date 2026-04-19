"use client";

import { useCallback, useRef, useState } from "react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type AcceptMode = "csv" | "xlsx" | ("csv" | "xlsx")[];

export type ExcelUploaderProps = {
  accept: AcceptMode;
  expectedColumns: string[];
  onParsed: (rows: Record<string, unknown>[], file: File) => void | Promise<void>;
  onError: (message: string) => void;
  parser: (file: File) => Promise<Record<string, unknown>[]>;
  /** 바이트 단위 최대 용량 (기본 35MB) */
  maxBytes?: number;
};

const DEFAULT_MAX = 35 * 1024 * 1024;

function extensionAllowed(fileName: string, accept: AcceptMode): boolean {
  const lower = fileName.toLowerCase();
  const modes = Array.isArray(accept) ? accept : [accept];
  let ok = false;
  if (modes.includes("csv") && lower.endsWith(".csv")) ok = true;
  if (modes.includes("xlsx") && (lower.endsWith(".xlsx") || lower.endsWith(".xls"))) ok = true;
  return ok;
}

function validateExpectedColumns(
  rows: Record<string, unknown>[],
  expectedColumns: string[]
): string | null {
  if (!rows.length) return "파싱 결과가 비어 있습니다.";
  const keys = new Set(Object.keys(rows[0] ?? {}));
  for (const col of expectedColumns) {
    if (!keys.has(col)) {
      return `필수 열이 누락되었습니다: ${col}. 파일 형식이 올바른지 확인해 주세요.`;
    }
  }
  return null;
}

export default function ExcelUploader({
  accept,
  expectedColumns,
  onParsed,
  onError,
  parser,
  maxBytes = DEFAULT_MAX,
}: ExcelUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const runParse = useCallback(
    async (file: File) => {
      if (!extensionAllowed(file.name, accept)) {
        onError("파일 형식이 올바르지 않습니다. .csv 또는 .xlsx/.xls 파일을 올려주세요.");
        return;
      }
      if (file.size > maxBytes) {
        onError(`파일이 너무 큽니다. ${Math.round(maxBytes / 1024 / 1024)}MB 이하로 올려주세요.`);
        return;
      }
      setLoading(true);
      setProgress(8);
      try {
        setProgress(28);
        const rows = (await parser(file)) as Record<string, unknown>[];
        setProgress(72);
        const colErr = validateExpectedColumns(rows, expectedColumns);
        if (colErr) {
          onError(colErr);
          return;
        }
        setProgress(100);
        await Promise.resolve(onParsed(rows, file));
      } catch (e) {
        onError(e instanceof Error ? e.message : "파일을 읽는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
        setProgress(0);
      }
    },
    [accept, expectedColumns, maxBytes, onError, onParsed, parser]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void runParse(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void runParse(f);
  };

  const acceptAttr = (Array.isArray(accept) ? accept : [accept])
    .map((a) => (a === "csv" ? ".csv" : ".xlsx,.xls"))
    .join(",");

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "border-border flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
          dragOver ? "border-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/50"
        )}
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-muted-foreground mb-2">파일을 끌어다 놓거나 아래 버튼으로 선택하세요.</p>
        <Button type="button" variant="secondary" size="sm" onClick={(e) => e.stopPropagation()}>
          파일 선택
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={acceptAttr}
          onChange={onInputChange}
        />
      </div>
      {loading && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <LoadingSpinner size="sm" />
          <p className="text-muted-foreground text-center text-xs">파일을 분석하는 중입니다…</p>
        </div>
      )}
    </div>
  );
}
