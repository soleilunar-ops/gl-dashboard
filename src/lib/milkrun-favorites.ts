// 변경 이유: 센터 즐겨찾기를 localStorage에 저장합니다.
const STORAGE_KEY = "milkrun-center-favorites-v1";

export function getFavoriteCenterNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function setFavoriteCenterNames(names: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

export function toggleFavorite(name: string, current: string[]): string[] {
  const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
  setFavoriteCenterNames(next);
  return next;
}
