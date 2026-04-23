"use client";

import { useState } from "react";
import { Upload as UploadIcon, FileCheck, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export interface UploadCategory {
  key: string;
  label: string;
  description: string;
  accept: "csv" | "xlsx";
  targetTable: string;
  exampleFile: string;
}

interface Props {
  category: UploadCategory;
  onUploaded: () => void;
}

type SlotState =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "success"; fileName: string; rows: number }
  | { kind: "error"; message: string };

// CSV: 첫 줄 헤더 + 이후 데이터 줄 카운트. XLSX는 클라이언트 파싱 없이 바이트 크기만 기록.
async function countCsvRows(file: File): Promise<number> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return Math.max(0, lines.length - 1);
}

export function UploadSlot({ category, onUploaded }: Props) {
  const [state, setState] = useState<SlotState>({ kind: "idle" });

  const handleFile = async (file: File) => {
    setState({ kind: "parsing", fileName: file.name });
    try {
      let rowCount = 0;
      if (category.accept === "csv" && file.name.toLowerCase().endsWith(".csv")) {
        rowCount = await countCsvRows(file);
      }

      const sb = createClient();
      const { error } = await sb.from("excel_uploads").insert({
        file_name: file.name,
        file_size: file.size,
        category: category.key,
        target_table: category.targetTable,
        total_rows: rowCount || null,
        status: "received",
        uploaded_at: new Date().toISOString(),
        notes: "엑셀 업로드 대시보드에서 업로드",
      });
      if (error) throw new Error(error.message);

      setState({ kind: "success", fileName: file.name, rows: rowCount });
      onUploaded();
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "업로드 실패",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{category.label}</h3>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {category.accept.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-gray-500">{category.description}</p>
        <p className="text-[11px] text-gray-400">예: {category.exampleFile}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-6 text-sm text-gray-600 transition-colors hover:border-orange-300 hover:bg-orange-50">
          <UploadIcon className="h-4 w-4" />
          <span>파일 선택 또는 드래그</span>
          <input
            type="file"
            accept={category.accept === "csv" ? ".csv" : ".xlsx,.xls"}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {state.kind === "parsing" && (
          <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
            {state.fileName} 처리 중...
          </div>
        )}
        {state.kind === "success" && (
          <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700">
            <FileCheck className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{state.fileName}</span>
            <span>{state.rows > 0 ? `${state.rows.toLocaleString()}행` : "접수 완료"}</span>
          </div>
        )}
        {state.kind === "error" && (
          <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="flex-1">{state.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => setState({ kind: "idle" })}
            >
              재시도
            </Button>
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          → <span className="font-mono">{category.targetTable}</span> 테이블로 적재 대기
        </p>
      </CardContent>
    </Card>
  );
}
