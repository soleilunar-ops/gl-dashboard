"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { navigation } from "@/components/layout/navigation.config";
import { createClient } from "@/lib/supabase/client";

// user_preferences 테이블이 생성된 스키마는 supabase/types.ts 재생성 전이라 캐스트로 우회.
type UntypedTable = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        c: string,
        v: unknown
      ) => {
        eq: (
          c: string,
          v: unknown
        ) => {
          maybeSingle: () => Promise<{
            data: { value: unknown } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
  };
};

const PREF_KEY = "favorite_navs";
const MAX_FAVORITES = 3;

export interface FavoriteNav {
  label: string;
  path: string;
  icon: string;
}

/** 홈 화면의 즐겨찾기 바로가기 (최대 3개, Supabase user_preferences에 user_id별로 영속화) */
export function useFavoriteNavs() {
  const [favorites, setFavorites] = useState<FavoriteNav[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // 세션 · 기존 즐겨찾기 불러오기
  useEffect(() => {
    const sb = createClient();
    let canceled = false;

    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (canceled) return;
      if (!user) {
        setLoaded(true);
        return;
      }
      setUserId(user.id);

      const { data, error } = await (sb as unknown as UntypedTable)
        .from("user_preferences")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", PREF_KEY)
        .maybeSingle();

      if (!canceled && !error && data?.value) {
        const arr = Array.isArray(data.value) ? (data.value as FavoriteNav[]) : [];
        setFavorites(arr.slice(0, MAX_FAVORITES));
      }
      if (!canceled) setLoaded(true);
    })();

    return () => {
      canceled = true;
    };
  }, []);

  // 변경 시 Supabase upsert
  const persist = useCallback(
    async (next: FavoriteNav[]) => {
      if (!userId) return;
      const sb = createClient();
      await (sb as unknown as UntypedTable)
        .from("user_preferences")
        .upsert(
          { user_id: userId, key: PREF_KEY, value: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
    },
    [userId]
  );

  const allNavs: FavoriteNav[] = useMemo(() => navigation.flatMap((g) => g.items), []);

  const isFavorite = useCallback(
    (path: string) => favorites.some((f) => f.path === path),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (nav: FavoriteNav) => {
      setFavorites((prev) => {
        let next: FavoriteNav[];
        if (prev.some((f) => f.path === nav.path)) {
          next = prev.filter((f) => f.path !== nav.path);
        } else if (prev.length >= MAX_FAVORITES) {
          return prev;
        } else {
          next = [...prev, nav];
        }
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeFavorite = useCallback(
    (path: string) => {
      setFavorites((prev) => {
        const next = prev.filter((f) => f.path !== path);
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  return {
    favorites,
    allNavs,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    max: MAX_FAVORITES,
    loaded,
  };
}
