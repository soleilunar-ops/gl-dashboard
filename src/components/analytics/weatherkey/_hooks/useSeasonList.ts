"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, SeasonConfig } from "../_types";

/**
 * 시즌 셀렉터 옵션용. season_config 전체 (start_date 역순).
 */
export function useSeasonList(): HookResult<SeasonConfig[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<SeasonConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: rows, error: qErr } = await supabase
        .from("season_config")
        .select("*")
        .order("start_date", { ascending: false });
      if (qErr) throw new Error(qErr.message);

      setData(rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "시즌 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
