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
  Upload,
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
  CloudSun,
  Ship,
  Truck,
  Upload,
};

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <aside className="bg-card flex h-full w-60 flex-col border-r">
      {/* 로고 */}
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <LayoutDashboard className="h-5 w-5" />
          <span>하루온 재고시스템</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="text-muted-foreground mb-1 px-2 text-xs font-medium">{group.title}</p>
            {group.items.map((item) => {
              const Icon = iconMap[item.icon];
              const activePath = resolveActivePathInGroup(group.items, pathname);
              const isActive = activePath !== null && item.path === activePath;

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 로그아웃 */}
      <div className="border-t p-3">
        <button
          onClick={signOut}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
