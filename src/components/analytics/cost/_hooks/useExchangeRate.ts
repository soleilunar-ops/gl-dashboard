"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** 환율 상태 — 변경 이유: CNY·USD 2종 동시 노출 */
export type ExchangeRate = {
  cnyKrw: number | null;
  usdKrw: number | null;
  updatedAt: Date | null;
  isLoading: boolean;
  error: string | null;
};

type ApiResponse = {
  rate?: number | null;
  from?: string;
  to?: string;
  updatedAt?: string;
  error?: string;
};

/** 단일 통화 fetch — /api/exchange-rate 라우트 쿼리 규격(from/to) */
async function fetchOne(from: "CNY" | "USD"): Promise<number | null> {
  const res = await fetch(`/api/exchange-rate?from=${from}&to=KRW`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiResponse | null;
    throw new Error(body?.error ?? `환율 조회 실패 (${from}, HTTP ${res.status})`);
  }
  const body = (await res.json()) as ApiResponse;
  const n = Number(body.rate);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 환율 조회 훅 — 변경 이유: 마운트 시 1회 자동 + 수동 refresh, 실패 시 이전값 유지 */
export function useExchangeRate() {
  const [rate, setRate] = useState<ExchangeRate>({
    cnyKrw: null,
    usdKrw: null,
    updatedAt: null,
    isLoading: false,
    error: null,
  });
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRate((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const [cny, usd] = await Promise.all([fetchOne("CNY"), fetchOne("USD")]);
      setRate({
        cnyKrw: cny,
        usdKrw: usd,
        updatedAt: new Date(),
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "환율 API 호출 실패";
      console.error("[useExchangeRate]", msg);
      toast.error(msg);
      setRate((prev) => ({ ...prev, isLoading: false, error: msg }));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rate, refresh };
}
