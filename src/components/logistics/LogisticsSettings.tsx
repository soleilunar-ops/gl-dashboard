"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** PM이 supabase/types에 반영하기 전까지 훅 내부용 */
type ErpSyncLogRow = {
  id?: number;
  synced_at: string;
};

type LogisticsSettingsDb = {
  public: {
    Tables: Database["public"]["Tables"] & {
      erp_sync_log: {
        Row: ErpSyncLogRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: Database["public"]["Views"];
    Functions: Database["public"]["Functions"];
  };
};

export default function LogisticsSettings() {
  const [importResult, setImportResult] = useState<string>("");
  const [importLoading, setImportLoading] = useState(false);
  const [importAvailable, setImportAvailable] = useState<boolean | null>(null);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string>("");
  const [syncAvailable, setSyncAvailable] = useState<boolean | null>(null);

  const supabase = createClient() as unknown as SupabaseClient<LogisticsSettingsDb>;

  const loadLastErpSync = useCallback(async () => {
    setLastSyncError(null);
    const { data, error } = await supabase
      .from("erp_sync_log")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("erp_sync_log 조회 실패:", error.message);
      setLastSyncError(error.message);
      setLastSyncedAt(null);
      return;
    }

    const row = (data ?? [])[0] as ErpSyncLogRow | undefined;
    setLastSyncedAt(row?.synced_at ?? null);
  }, [supabase]);

  useEffect(() => {
    void loadLastErpSync();
  }, [loadLastErpSync]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/import/excel", { method: "GET" });
        if (cancelled) return;
        setImportAvailable(res.status !== 404);
      } catch {
        if (!cancelled) setImportAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/erp/sync", { method: "GET" });
        if (!cancelled) setSyncAvailable(res.ok);
      } catch {
        if (!cancelled) setSyncAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExcelImport = async () => {
    setImportLoading(true);
    setImportResult("");
    try {
      const response = await fetch("/api/import/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const text = await response.text();
      let message: string;
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        message = JSON.stringify(json, null, 2);
      } catch {
        message = text || `HTTP ${response.status}`;
      }
      if (!response.ok) {
        setImportResult(`실패 (${response.status}): ${message}`);
      } else {
        setImportResult(message);
      }
    } catch (e) {
      console.error("엑셀 임포트 요청 실패:", e);
      setImportResult("요청 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
    setImportLoading(false);
  };

  const handleErpSync = async () => {
    setSyncLoading(true);
    setSyncResult("");
    try {
      const response = await fetch("/api/erp/sync", { method: "GET" });
      const text = await response.text();
      let message: string;
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        message = JSON.stringify(json, null, 2);
      } catch {
        message = text || `HTTP ${response.status}`;
      }
      if (!response.ok) {
        setSyncResult(`실패 (${response.status}): ${message}`);
      } else {
        setSyncResult(message);
      }
      await loadLastErpSync();
    } catch (e) {
      console.error("ERP 동기화 요청 실패:", e);
      setSyncResult("요청 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
    setSyncLoading(false);
  };

  const formatSyncedAt = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ko-KR");
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        초기 데이터·ERP 연동은 PM이 제공하는 API와 Supabase 스키마를 사용합니다.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">초기 데이터 임포트</CardTitle>
          <CardDescription>
            glprojectmasterdatav4_2.xlsx 파일을 서버에 넣고 아래 버튼을 눌러주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={importAvailable !== true || importLoading}
              onClick={() => void handleExcelImport()}
            >
              {importLoading ? "처리 중…" : "엑셀 임포트 실행"}
            </Button>
            {importAvailable === false ? (
              <p className="text-muted-foreground text-sm">
                POST /api/import/excel 라우트가 없습니다. PM에게 `src/app/api/import/excel/route.ts`
                생성을 요청하세요.
              </p>
            ) : importAvailable === null ? (
              <p className="text-muted-foreground text-sm">API 사용 가능 여부 확인 중…</p>
            ) : null}
          </div>
          {importResult ? (
            <pre className="bg-muted max-h-48 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
              {importResult}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ERP 동기화</CardTitle>
          <CardDescription>마지막 동기화 시각과 수동 동기화를 실행할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <span className="text-muted-foreground">마지막 동기화 시각: </span>
            <span className="font-medium">{formatSyncedAt(lastSyncedAt)}</span>
          </p>
          {lastSyncError ? (
            <p className="text-destructive text-sm">erp_sync_log 조회 오류: {lastSyncError}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={syncAvailable !== true || syncLoading}
              onClick={() => void handleErpSync()}
            >
              {syncLoading ? "동기화 중…" : "지금 동기화"}
            </Button>
            {syncAvailable === false ? (
              <p className="text-muted-foreground text-sm">
                GET /api/erp/sync 라우트가 없습니다. PM에게 API 생성을 요청하세요.
              </p>
            ) : syncAvailable === null ? (
              <p className="text-muted-foreground text-sm">API 사용 가능 여부 확인 중…</p>
            ) : null}
          </div>
          {syncResult ? (
            <pre className="bg-muted max-h-48 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
              {syncResult}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
