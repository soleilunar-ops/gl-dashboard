"use client";

import { useCallback, useMemo } from "react";

/** 향후 쿠팡/경쟁사 가격 API·크롤링 연동용 스텁 (SWR 스타일로 교체 용이) */
export function useCompetitorPrice(skuId?: string) {
  const refetch = useCallback(() => {}, []);

  return useMemo(
    () => ({
      data: undefined as number | undefined,
      isLoading: false,
      error: null as Error | null,
      refetch,
    }),
    [refetch, skuId]
  );
}
