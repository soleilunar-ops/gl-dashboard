"use client";

import { useCallback, useMemo } from "react";

/**
 * 쿠팡/경쟁사 가격 API·크롤링 연동용 스텁.
 * 2단에서 n8n 크롤러가 competitor_products 테이블에 쌓으면 여기서 조회로 교체 예정.
 */
export interface UseCompetitorPriceResult {
  data: number | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCompetitorPrice(): UseCompetitorPriceResult {
  const refetch = useCallback(() => {}, []);
  return useMemo<UseCompetitorPriceResult>(
    () => ({
      data: undefined,
      isLoading: false,
      error: null,
      refetch,
    }),
    [refetch]
  );
}
