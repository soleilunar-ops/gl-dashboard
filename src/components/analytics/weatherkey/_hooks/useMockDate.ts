"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "weatherkey.mockDate";
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * 개발용 "가짜 오늘" 날짜 오버라이드.
 *
 * - localStorage 영속 + `?mockDate=YYYY-MM-DD` URL 파라미터로 초기화
 * - 프로덕션 빌드에선 **항상 비활성** — setter no-op, getNow는 실제 날짜 반환
 * - AdminPopover에서 UI로 설정/해제
 */
type Ctx = {
  mockDate: string | null;
  setMockDate: (iso: string | null) => void;
  getNow: () => Date;
  enabled: boolean;
};

const MockDateContext = createContext<Ctx | null>(null);

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function MockDateProvider({ children }: { children: ReactNode }) {
  const [mockDate, setMockDateState] = useState<string | null>(null);

  useEffect(() => {
    if (IS_PROD) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const fromUrl = sp.get("mockDate");
      if (fromUrl) {
        localStorage.setItem(STORAGE_KEY, fromUrl);
        setMockDateState(fromUrl);
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setMockDateState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const setMockDate = useCallback((iso: string | null) => {
    if (IS_PROD) return;
    try {
      if (iso) localStorage.setItem(STORAGE_KEY, iso);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setMockDateState(iso);
  }, []);

  const getNow = useCallback(() => {
    if (IS_PROD) return new Date();
    const parsed = parseDate(mockDate);
    return parsed ?? new Date();
  }, [mockDate]);

  return createElement(
    MockDateContext.Provider,
    {
      value: {
        mockDate: IS_PROD ? null : mockDate,
        setMockDate,
        getNow,
        enabled: !IS_PROD,
      },
    },
    children
  );
}

export function useMockDate(): Ctx {
  const ctx = useContext(MockDateContext);
  if (!ctx) {
    return {
      mockDate: null,
      setMockDate: () => {},
      getNow: () => new Date(),
      enabled: false,
    };
  }
  return ctx;
}
