"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { navigation } from "@/components/layout/navigation.config";

const STORAGE_KEY = "dashboard:favorite-navs";
const MAX_FAVORITES = 3;

export interface FavoriteNav {
  label: string;
  path: string;
  icon: string;
}

/** 홈 화면의 즐겨찾기 바로가기 (최대 3개, localStorage 영속화) */
export function useFavoriteNavs() {
  const [favorites, setFavorites] = useState<FavoriteNav[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 첫 진입 시 localStorage에서 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FavoriteNav[];
        if (Array.isArray(parsed)) {
          setFavorites(parsed.slice(0, MAX_FAVORITES));
        }
      }
    } catch {
      // 손상된 데이터는 무시
    }
    setLoaded(true);
  }, []);

  // 변경 시 저장
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // quota 초과 등 — 조용히 무시
    }
  }, [favorites, loaded]);

  const allNavs: FavoriteNav[] = useMemo(() => navigation.flatMap((g) => g.items), []);

  const isFavorite = useCallback(
    (path: string) => favorites.some((f) => f.path === path),
    [favorites]
  );

  const toggleFavorite = useCallback((nav: FavoriteNav) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.path === nav.path)) {
        return prev.filter((f) => f.path !== nav.path);
      }
      if (prev.length >= MAX_FAVORITES) return prev;
      return [...prev, nav];
    });
  }, []);

  const removeFavorite = useCallback((path: string) => {
    setFavorites((prev) => prev.filter((f) => f.path !== path));
  }, []);

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
