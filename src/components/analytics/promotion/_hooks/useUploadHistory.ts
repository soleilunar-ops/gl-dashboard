"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** 프로모션 업로드 이력 UI에 노출할 카테고리 (다른 팀 영역 업로드 제외) */
const PROMOTION_CATEGORIES = [
  "coupon_contracts",
  "daily_performance",
  "delivery_detail",
  "milkrun_costs",
] as const;

const T_EXCEL_UPLOADS = "excel_uploads" as never;

/**
 * excel_uploads 로컬 Row 타입 — types.ts 재생성 전까지 수동 정의
 * (다음 auto-types 실행 후 Tables<"excel_uploads"> 로 대체)
 */
export type UploadHistoryRow = {
  id: number;
  file_name: string;
  storage_path: string | null;
  file_size: number | null;
  file_hash: string | null;
  category: string;
  company_code: string | null;
  period_start: string | null;
  period_end: string | null;
  target_table: string | null;
  total_rows: number | null;
  inserted_rows: number | null;
  skipped_rows: number | null;
  error_rows: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  notes: string | null;
};

export function useUploadHistory(limit = 10) {
  const [rows, setRows] = useState<UploadHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from(T_EXCEL_UPLOADS)
        .select("*")
        .in("category", [...PROMOTION_CATEGORIES])
        .order("uploaded_at", { ascending: false })
        .limit(limit);
      if (qErr) throw new Error(qErr.message);
      setRows((data ?? []) as UploadHistoryRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
