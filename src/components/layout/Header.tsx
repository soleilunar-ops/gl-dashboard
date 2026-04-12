"use client";

import { Bell } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";

export default function Header() {
  const { user } = useAuth();

  // 이메일에서 @gl.local 앞부분만 표시
  const displayName = user?.email?.replace("@gl.local", "") ?? "";

  return (
    <header className="bg-card flex h-14 items-center justify-between border-b px-6">
      <div />

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
