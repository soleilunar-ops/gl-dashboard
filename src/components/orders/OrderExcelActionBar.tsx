"use client";

import { Download, Upload } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  fileRef: RefObject<HTMLInputElement | null>;
  sampleLoading: boolean;
  importing: boolean;
  statusMessage: string | null;
  parseErrors: string[];
  onPickFile: (file: File | null) => Promise<void> | void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  onLoadSample: () => void;
  onImport: () => void;
  onDownloadAll: () => void;
};

/** 구매현황 엑셀 — 업로드·샘플·DB반영·전체다운로드 (테이블 하단 고정 배치) */
export default function OrderExcelActionBar({
  fileRef,
  sampleLoading,
  importing,
  statusMessage,
  parseErrors,
  onPickFile,
  onLoadSample,
  onImport,
  onDownloadAll,
}: Props) {
  return (
    <div className="space-y-2 border-t pt-3">
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
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" />
          자료 업로드 (.xlsx)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onLoadSample}
          disabled={sampleLoading}
        >
          {sampleLoading ? "불러오는 중…" : "업로드 자료 불러오기 (제출용 샘플)"}
        </Button>
        <Button type="button" size="sm" onClick={onImport} disabled={importing}>
          {importing ? "DB 반영 중…" : "DB 반영"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDownloadAll}>
          <Download className="mr-1 h-4 w-4" />
          전체 다운로드
        </Button>
      </div>
      {statusMessage ? <p className="text-muted-foreground text-xs">{statusMessage}</p> : null}
      {parseErrors.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-700">
            파싱 경고 {parseErrors.length}건
          </summary>
          <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto">
            {parseErrors.slice(0, 40).map((err) => (
              <li key={err}>{err}</li>
            ))}
            {parseErrors.length > 40 ? <li>… 외 {parseErrors.length - 40}건</li> : null}
          </ul>
        </details>
      ) : null}
      <p className="text-muted-foreground text-[10px]">
        동일 전표번호는 DB 반영 시 건너뜁니다. 합계는 수량×단가와 일치해야 저장됩니다.
      </p>
    </div>
  );
}
