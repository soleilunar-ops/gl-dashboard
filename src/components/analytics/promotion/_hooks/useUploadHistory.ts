"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type UploadHistoryRow = Tables<"upload_history">;

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
        .from("upload_history")
        .select("*")
        .order("uploaded_at", { ascending: false })
        .limit(limit);
      if (qErr) throw new Error(qErr.message);
      setRows(data ?? []);
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
