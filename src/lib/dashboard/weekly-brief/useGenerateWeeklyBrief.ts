"use client";

// 07 v0.2 — 생성 mutation 훅.
// supabase-js의 functions.invoke는 에러 body를 못 보여주므로 fetch 직접 호출.
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface GenerateOpts {
  weekStart?: string;
  force?: boolean;
}

interface MutationState {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: unknown | null;
}

export function useGenerateWeeklyBrief(opts: { onSuccess?: () => void } = {}) {
  const [state, setState] = useState<MutationState>({
    isPending: false,
    isError: false,
    error: null,
    data: null,
  });

  const mutate = useCallback(
    async (args: GenerateOpts = {}) => {
      setState({ isPending: true, isError: false, error: null, data: null });

      try {
        const sb = createClient();
        const {
          data: { session },
        } = await sb.auth.getSession();
        const token = session?.access_token;

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL! + "/functions/v1/generate-weekly-brief";

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ week_start: args.weekStart, force: args.force }),
        });

        // 응답 본문 확인 (에러 시에도)
        let json: { ok?: boolean; error?: string; report?: unknown } | null = null;
        try {
          json = await res.json();
        } catch {
          /* non-JSON */
        }

        if (!res.ok || !json?.ok) {
          const msg = json?.error ?? `HTTP ${res.status}`;
          console.error("[generate-weekly-brief] 실패:", { status: res.status, body: json });
          setState({
            isPending: false,
            isError: true,
            error: new Error(msg),
            data: null,
          });
          return;
        }

        setState({ isPending: false, isError: false, error: null, data: json });
        opts.onSuccess?.();
      } catch (err) {
        console.error("[generate-weekly-brief] 예외:", err);
        setState({
          isPending: false,
          isError: true,
          error: err instanceof Error ? err : new Error(String(err)),
          data: null,
        });
      }
    },
    [opts]
  );

  const reset = useCallback(() => {
    setState({ isPending: false, isError: false, error: null, data: null });
  }, []);

  return { ...state, mutate, reset };
}
