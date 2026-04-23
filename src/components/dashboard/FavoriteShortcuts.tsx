"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  Check,
  X,
  Package,
  TrendingUp,
  Megaphone,
  Upload,
  Ship,
  Truck,
  CloudSun,
  Triangle,
  ShoppingCart,
  MessageSquare,
  Calculator,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFavoriteNavs, type FavoriteNav } from "./_hooks/useFavoriteNavs";
import { cn } from "@/lib/utils";

// navigation.config.ts에서 사용하는 아이콘 이름 매핑
const iconMap: Record<string, LucideIcon> = {
  Package,
  TrendingUp,
  Megaphone,
  Upload,
  Ship,
  Truck,
  CloudSun,
  Triangle,
  ShoppingCart,
  MessageSquare,
  Calculator,
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name] ?? Sparkles;
  return <Icon className={className} />;
}

/** 사이드바 탭 중 최대 3개를 홈 화면에 핀 고정 */
export function FavoriteShortcuts() {
  const { favorites, allNavs, isFavorite, toggleFavorite, removeFavorite, max, loaded } =
    useFavoriteNavs();
  const [open, setOpen] = useState(false);

  // SSR 하이드레이션 충돌 방지
  if (!loaded) {
    return <div className="h-24" aria-hidden />;
  }

  // 3개 슬롯 — 빈 자리에는 추가 버튼
  const slots: (FavoriteNav | null)[] = [
    favorites[0] ?? null,
    favorites[1] ?? null,
    favorites[2] ?? null,
  ];

  return (
    <>
      <div className="flex items-start justify-center gap-14 sm:gap-16">
        {slots.map((nav, idx) =>
          nav ? (
            <div key={nav.path} className="group/fav relative flex flex-col items-center">
              <Link
                href={nav.path}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FDF3D0] text-[#C78D26] ring-1 ring-[#F9DB94]/60 transition-all hover:-translate-y-0.5 hover:bg-[#FAE8B8] hover:shadow-md"
                aria-label={`${nav.label}로 이동`}
              >
                <NavIcon name={nav.icon} className="h-9 w-9" />
              </Link>
              <span className="mt-3 max-w-[120px] truncate text-center text-sm font-medium text-gray-600">
                {nav.label}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  removeFavorite(nav.path);
                }}
                aria-label="즐겨찾기 제거"
                className="absolute -top-1 -right-1 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm ring-1 ring-gray-200 transition-colors group-hover/fav:flex hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              key={`empty-${idx}`}
              type="button"
              onClick={() => setOpen(true)}
              className="group/add flex flex-col items-center"
              aria-label="즐겨찾기 추가"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-[#F9DB94] bg-white text-[#F2BE5C] transition-colors group-hover/add:border-[#E3A83E] group-hover/add:text-[#C78D26]">
                <Plus className="h-7 w-7" />
              </span>
              <span className="mt-3 text-sm font-medium text-gray-400 group-hover/add:text-[#C78D26]">
                바로가기 추가
              </span>
            </button>
          )
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>즐겨찾기 메뉴 선택</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            사이드바 메뉴 중 자주 사용하는 탭을 최대 {max}개까지 선택하세요. ({favorites.length}/
            {max})
          </p>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {allNavs.map((item) => {
              const active = isFavorite(item.path);
              const disabled = !active && favorites.length >= max;
              return (
                <button
                  key={item.path}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleFavorite(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-[#F2BE5C] bg-[#FDF3D0] text-[#8A6A1F]"
                      : "border-transparent hover:border-[#F9DB94] hover:bg-[#FDF3D0]/70",
                    disabled &&
                      "cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent"
                  )}
                >
                  <span className="flex-1">{item.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-[#C78D26]" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
