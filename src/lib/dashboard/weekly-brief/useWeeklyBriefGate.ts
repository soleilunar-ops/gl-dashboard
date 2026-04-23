"use client";

// 07 v0.2 — gate 상태 훅. 1분 간격 자동 갱신.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GateResult } from "./types";

interface GateHookResult {
  data: GateResult | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWeeklyBriefGate(): GateHookResult {
  const [data, setData] = useState<GateResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const sb = createClient();
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        // RPC 이름이 Database 타입에 반영되지 않아 unknown 캐스트로 우회
        const call = sb.rpc as unknown as (
          name: string
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
        const { data: gate, error: e } = await call("can_generate_weekly_brief");
        if (cancelled) return;
        if (e) {
          console.error("[useWeeklyBriefGate] RPC error:", e);
          setError(new Error(e.message));
          setData(null);
        } else {
          setError(null);
          setData(gate as GateResult);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[useWeeklyBriefGate] unexpected:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  // 60초마다 자동 갱신 (자정 경계에서 상태 바뀜)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return { data, isLoading, error, refetch };
}
