"use client";

import { useCallback, useEffect, useState } from "react";

interface ExchangeRateResponse {
  base: string;
  target: string;
  rate: number;
  fetchedAt: string;
}

export function useExchangeRate(initialRate: number = 194.8) {
  const [exCurrent, setExCurrent] = useState(initialRate);
  const [usdKrwRate, setUsdKrwRate] = useState(0);
  const [rateStatus, setRateStatus] = useState("환율 API 동기화 대기");
  const [isRateLoading, setIsRateLoading] = useState(false);

  const fetchRate = useCallback(async (base: "CNY" | "USD") => {
    const response = await fetch(`/api/exchange-rate?base=${base}&target=KRW`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json()) as Partial<ExchangeRateResponse> & { message?: string };

    if (!response.ok || typeof payload.rate !== "number") {
      throw new Error(payload.message ?? `${base}/KRW 환율 API 응답 오류`);
    }

    return payload;
  }, []);

  // ②번 수정: deps에서 exCurrent 제거, 함수형 업데이트로 무한루프 방지
  const fetchExchangeRate = useCallback(async () => {
    setIsRateLoading(true);
    try {
      const [cnyPayload, usdPayload] = await Promise.all([fetchRate("CNY"), fetchRate("USD")]);
      setExCurrent((prev) => cnyPayload.rate ?? prev);
      setUsdKrwRate(usdPayload.rate ?? 0);

      const cnyTime = cnyPayload.fetchedAt
        ? new Date(cnyPayload.fetchedAt).toLocaleTimeString("ko-KR")
        : "-";
      const usdTime = usdPayload.fetchedAt
        ? new Date(usdPayload.fetchedAt).toLocaleTimeString("ko-KR")
        : "-";
      setRateStatus(`환율 동기화 완료 (CNY ${cnyTime} / USD ${usdTime})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "환율 API 호출 실패";
      setRateStatus(`${message}: 네트워크/키 설정을 확인해주세요.`);
    } finally {
      setIsRateLoading(false);
    }
  }, [fetchRate]);

  useEffect(() => {
    void fetchExchangeRate();
  }, [fetchExchangeRate]);

  return {
    exCurrent,
    setExCurrent,
    usdKrwRate,
    rateStatus,
    isRateLoading,
    fetchExchangeRate,
  };
}
