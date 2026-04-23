"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => setSidebarOpen((o) => !o);

  return (
    <div className="bg-background flex h-full">
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />
      {/* min-w-0 필수: 자식의 넓은 테이블(min-w-1260px)이 flex 컨테이너를 뚫고 나가는 것 방지
          relative 필수: 헤더가 absolute로 이 컨테이너 기준 상단에 고정 */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
        <main className="bg-background flex-1 overflow-y-auto">{children}</main>
      </div>
      <Toaster richColors position="top-center" />
    </div>
  );
}
