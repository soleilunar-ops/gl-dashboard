"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * `?highlight=YYYY-MM-DD` 양방향 동기화.
 * 트리거 카드 · 예보 카드 · 차트 간 크로스 포커스용 공유 상태.
 */
export function useHighlightQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const highlighted = params.get("highlight");

  const setHighlight = useCallback(
    (iso: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (iso) {
        next.set("highlight", iso);
      } else {
        next.delete("highlight");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const toggleHighlight = useCallback(
    (iso: string) => {
      setHighlight(highlighted === iso ? null : iso);
    },
    [highlighted, setHighlight]
  );

  return { highlighted, setHighlight, toggleHighlight };
}
