"use client";

import { createContext, createElement, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

/**
 * 트리거 카드 · 예보 카드 · 차트 간 크로스 포커스용 공유 상태.
 * React Context 기반 메모리 상태 — 새로고침 시 자동 해제.
 * (이전 URL 파라미터 방식은 잔상이 URL에 남아 UX 문제 있었음)
 */
type HighlightContextValue = {
  highlighted: string | null;
  setHighlight: (iso: string | null) => void;
  toggleHighlight: (iso: string) => void;
};

const HighlightContext = createContext<HighlightContextValue | null>(null);

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [highlighted, setHighlightState] = useState<string | null>(null);
  const setHighlight = useCallback((iso: string | null) => setHighlightState(iso), []);
  const toggleHighlight = useCallback(
    (iso: string) => setHighlightState((prev) => (prev === iso ? null : iso)),
    []
  );
  return createElement(
    HighlightContext.Provider,
    { value: { highlighted, setHighlight, toggleHighlight } },
    children
  );
}

export function useHighlightQuery(): HighlightContextValue {
  const ctx = useContext(HighlightContext);
  if (!ctx) {
    // Provider 밖에서 호출되면 no-op 반환 (SSR 등 edge case)
    return {
      highlighted: null,
      setHighlight: () => {},
      toggleHighlight: () => {},
    };
  }
  return ctx;
}
