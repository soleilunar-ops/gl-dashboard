"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  statusMessage: string | null;
  parseErrors: string[];
  onDownloadAll: () => void;
};

/** 구매현황 엑셀 — 전체다운로드·안내 (파일 선택·업로드는 다이얼로그 상단 배치) — 변경 이유: 제출용 샘플 버튼 제거 */
export default function OrderExcelActionBar({ statusMessage, parseErrors, onDownloadAll }: Props) {
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
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
        동일 전표번호는 업로드 시 건너뜁니다. 합계는 수량×단가와 일치해야 저장됩니다.
      </p>
    </div>
  );
}
