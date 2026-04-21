"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type DayAnalysis = {
  season: string;
  date: string;
  body: string;
  model: string | null;
  generated_at: string;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; analysis: DayAnalysis; cached: boolean }
  | { kind: "error"; message: string };

/**
 * 선택일 AI 분석 (1~2문장 맥락 설명).
 * (season, date) PK로 영구 캐시 — 같은 날 두 번째 조회부터는 DB 히트.
 */
export function useDayAnalysis(season: string | null, date: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>({ kind: "idle" });

  const load = useCallback(async () => {
    if (!season || !date) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });

    // 1) DB 캐시 조회
    try {
      const { data: cached } = await supabase
        .from("hotpack_day_analysis")
        .select("*")
        .eq("season", season)
        .eq("date", date)
        .maybeSingle();
      if (cached) {
        setState({ kind: "ready", analysis: cached as DayAnalysis, cached: true });
        return;
      }
    } catch {
      // 캐시 miss 취급
    }

    // 2) Edge Function 호출
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        cached?: boolean;
        analysis?: DayAnalysis;
        error?: string;
      }>("analyze-trigger-day", { body: { season, date } });
      if (error) throw error;
      if (!data?.ok || !data.analysis) {
        throw new Error(data?.error ?? "분석 응답 형식 오류");
      }
      setState({
        kind: "ready",
        analysis: data.analysis,
        cached: Boolean(data.cached),
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [season, date, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
