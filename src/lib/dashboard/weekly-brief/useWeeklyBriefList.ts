"use client";

// 07 v0.2 — 주간 리포트 히스토리 조회 훅.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeeklyBriefParsed, WeeklyBriefBody, WeeklyBriefRow } from "./types";

interface ListHookResult {
  data: WeeklyBriefParsed[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWeeklyBriefList(limit = 10, refreshKey = 0): ListHookResult {
  const [data, setData] = useState<WeeklyBriefParsed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sb = createClient();
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const { data: rows, error: e } = await sb
        .from("hotpack_llm_reports")
        .select("id, season, kind, body_md, model, generated_at")
        .eq("kind", "weekly_brief")
        .order("generated_at", { ascending: false })
        .limit(limit);

      if (cancelled) return;

      if (e) {
        setError(new Error(e.message));
        setData([]);
      } else {
        const parsed: WeeklyBriefParsed[] = [];
        for (const r of (rows ?? []) as WeeklyBriefRow[]) {
          try {
            const body = JSON.parse(r.body_md) as WeeklyBriefBody;
            parsed.push({ ...r, parsed: body });
          } catch {
            /* skip malformed */
          }
        }
        setError(null);
        setData(parsed);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [limit, tick, refreshKey]);

  return { data, isLoading, error, refetch: () => setTick((t) => t + 1) };
}

/** 단일 리포트 조회 (?brief=<id>) */
export function useWeeklyBrief(reportId: string | null) {
  const [data, setData] = useState<WeeklyBriefParsed | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!reportId) {
      setData(null);
      return;
    }
    const sb = createClient();
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const { data: row, error: e } = await sb
        .from("hotpack_llm_reports")
        .select("id, season, kind, body_md, model, generated_at")
        .eq("id", reportId)
        .eq("kind", "weekly_brief")
        .maybeSingle();

      if (cancelled) return;
      if (e || !row) {
        setError(e ? new Error(e.message) : new Error("리포트를 찾지 못했습니다"));
        setData(null);
      } else {
        try {
          const body = JSON.parse((row as WeeklyBriefRow).body_md);
          setError(null);
          setData({ ...(row as WeeklyBriefRow), parsed: body });
        } catch (pe) {
          setError(pe as Error);
          setData(null);
        }
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return { data, isLoading, error };
}
