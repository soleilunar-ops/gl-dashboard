"use client";

import { Bell, Menu } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";

interface HeaderProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export default function Header({ onToggleSidebar, sidebarOpen = true }: HeaderProps) {
  const { user } = useAuth();

  // 이메일에서 @gl.local 앞부분만 표시
  const displayName = user?.email?.replace("@gl.local", "") ?? "";

  return (
    <header className="bg-background flex h-14 items-center justify-between px-6">
      {/* 사이드바가 접혀 있을 때만 헤더에 햄버거 노출. 펼쳤을 땐 Sidebar 내부에 있음 */}
      {!sidebarOpen ? (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="사이드바 펼치기"
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-4">
        {/* 알림 아이콘 (나중에 alerts 테이블 연동) */}
        <button className="text-muted-foreground hover:bg-accent hover:text-accent-foreground relative rounded-md p-2 transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        {/* 사용자 이름 */}
        {displayName && <span className="text-sm font-medium">{displayName}</span>}
      </div>
    </header>
  );
}
