"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HookResult, KeywordDailyWithMa } from "../_types";

/**
 * 최근 N일 (기본 60일) 키워드별 검색지수 + 7일 이동평균 + MA 대비 배수.
 * 라인 차트 + 오늘 급등 TOP3 카드 양쪽에서 사용.
 */
export function useKeywordTrends(days: number = 60): HookResult<KeywordDailyWithMa[]> {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<KeywordDailyWithMa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - days);
    const fromIso = from.toISOString().slice(0, 10);

    try {
      const { data: rows, error: qErr } = await supabase
        .from("v_keyword_daily_with_ma")
        .select("*")
        .gte("trend_date", fromIso)
        .order("trend_date", { ascending: true });
      if (qErr) throw new Error(qErr.message);

      setData(rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "키워드 트렌드를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [days, supabase]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return { data, loading, error, refetch: () => void load() };
}
