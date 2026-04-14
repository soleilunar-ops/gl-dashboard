"use client";

import { useState } from "react";

interface ImportResult {
  items: number;
  snapshots: number;
  transactions: number;
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleInitialImport = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 한국어 주석: 서버 내 엑셀 기본 경로를 사용하여 초기 데이터 임포트 실행
      const response = await fetch("/api/import/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookPath: "C:/Users/user/Desktop/GL/GL/gl-project-master-data-v4_(2).xlsx",
        }),
      });

      const payload = (await response.json()) as
        | { success: true; imported: ImportResult }
        | { success: false; message: string };

      if (!response.ok || payload.success === false) {
        const message = "message" in payload ? payload.message : "임포트에 실패했습니다.";
        throw new Error(message);
      }

      setResult(payload.imported);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      setErrorMessage(message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-6">
      <h1 className="text-2xl font-bold">설정</h1>
      <p className="text-sm text-gray-600">
        ERP 연동 키, 자동 동기화 주기, 엑셀 기본 포맷을 관리합니다.
      </p>

      <button
        type="button"
        onClick={handleInitialImport}
        disabled={isLoading}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isLoading ? "임포트 실행 중..." : "초기 데이터 임포트"}
      </button>

      {result ? (
        <p className="text-sm text-green-700">
          품목 {result.items.toLocaleString()}개, 스냅샷 {result.snapshots.toLocaleString()}건, 거래{" "}
          {result.transactions.toLocaleString()}건 임포트 완료
        </p>
      ) : null}

      {errorMessage ? <p className="text-sm text-red-600">임포트 실패: {errorMessage}</p> : null}
    </div>
  );
}
