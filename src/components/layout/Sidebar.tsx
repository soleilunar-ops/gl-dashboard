"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  TrendingUp,
  MessageSquare,
  Calculator,
  Package,
  Megaphone,
  LogOut,
  LayoutDashboard,
  CloudSun,
  Ship,
  Truck,
  Triangle,
  Upload,
  Menu,
  Snowflake,
  Boxes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { navigation, type NavItem } from "./navigation.config";
import { useAuth } from "@/lib/hooks/useAuth";
import { cn } from "@/lib/utils";

/** 부모(/logistics)와 자식(/logistics/leadtime)이 동시에 매칭될 때 더 긴 경로만 활성(선택) 처리 */
function resolveActivePathInGroup(items: NavItem[], pathname: string): string | null {
  const matches = items.filter((it) => pathname === it.path || pathname.startsWith(it.path + "/"));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.path.length > a.path.length ? b : a)).path;
}

// 아이콘 이름 → 컴포넌트 매핑
const iconMap: Record<string, LucideIcon> = {
  ShoppingCart,
  TrendingUp,
  MessageSquare,
  Calculator,
  Package,
  Megaphone,
  LayoutDashboard,
  CloudSun,
  Ship,
  Truck,
  Triangle,
  Upload,
  Snowflake,
  Boxes,
};

interface SidebarProps {
  open?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ open = true, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <aside
      className={cn(
        "bg-background flex h-full shrink-0 flex-col overflow-hidden border-r transition-[width] duration-300",
        open ? "w-60" : "w-0 border-r-0"
      )}
    >
      <div className="flex h-full w-60 flex-col">
        {/* 좌측 로고 + 중앙 하루루 마스코트 + 사이드바 토글 */}
        <div className="flex h-14 items-center gap-2 px-4">
          <Link href="/" className="shrink-0" aria-label="홈으로">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/사이드바.png"
              alt="하루온 재고시스템"
              className="h-9 w-auto object-contain"
            />
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-start">
            <Link href="/" aria-label="홈으로">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/mascot/하루루투명.png"
                alt="하루루 로고"
                className="h-9 w-auto object-contain"
              />
            </Link>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label="사이드바 접기"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 rounded-md p-2 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navigation.map((group, gi) => (
            <div key={group.title || `group-${gi}`} className="mb-4">
              {group.title && (
                <p className="mb-1.5 px-2 text-base font-bold tracking-tight text-gray-800">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const activePath = resolveActivePathInGroup(group.items, pathname);
                const isActive = activePath !== null && item.path === activePath;

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-[15px] transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 로그아웃 */}
        <div className="p-3">
          <button
            onClick={signOut}
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 rounded-md px-2 py-2 text-[15px] transition-colors"
          >
            <LogOut className="h-5 w-5" />
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  );
}
