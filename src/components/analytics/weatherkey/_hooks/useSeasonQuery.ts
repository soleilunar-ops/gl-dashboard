"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL `?season=` 쿼리 ↔ 시즌 상태 양방향 바인딩.
 *
 * - `selected`: URL에 있으면 그 값, 없으면 null
 * - `setSeason(s)`: URL을 replace (뒤로가기 스택 오염 없이)
 * - `clearSeason()`: 쿼리 제거 → `useCurrentSeason`의 하이브리드 기본값으로 되돌림
 */
export function useSeasonQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("season");

  const setSeason = useCallback(
    (s: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("season", s);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const clearSeason = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("season");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return { selected, setSeason, clearSeason };
}
