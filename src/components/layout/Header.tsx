"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

/**
 * 헤더 동작:
 *  - 홈(/)에서는 absolute + 투명 오버레이 → 스크롤 시 콘텐츠가 뒤로 비쳐 보임
 *  - 그 외 페이지에서는 일반 flex 흐름 → 페이지 제목/콘텐츠와 안 겹침
 *  - 큰 로고는 홈 + 사이드바 접힘일 때만 노출
 */
export default function Header({ onToggleSidebar, sidebarOpen = true }: HeaderProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const showBigLogo = !sidebarOpen && isHome;

  // 이메일에서 @gl.local 앞부분만 표시
  const displayName = user?.email?.replace("@gl.local", "") ?? "";

  return (
    <header
      className={cn(
        "flex items-center justify-between px-6",
        isHome ? "pointer-events-none absolute inset-x-0 top-0 z-20" : "bg-background shrink-0",
        showBigLogo ? "h-26" : "h-14"
      )}
    >
      {!sidebarOpen ? (
        <div className={cn("flex items-center gap-4", isHome && "pointer-events-auto")}>
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="사이드바 펼치기"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          {showBigLogo && (
            <Link href="/" aria-label="홈으로" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/mascot/하루루투명.png"
                alt="하루루 로고"
                className="h-18 w-auto object-contain"
              />
            </Link>
          )}
        </div>
      ) : (
        <div />
      )}

      <div className={cn("flex items-center gap-4", isHome && "pointer-events-auto")}>
        <button className="text-muted-foreground hover:bg-accent hover:text-accent-foreground relative rounded-md p-2 transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        {displayName && <span className="text-sm font-medium">{displayName}</span>}
      </div>
    </header>
  );
}
