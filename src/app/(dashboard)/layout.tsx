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
      <div className="flex flex-1 flex-col">
        <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
        <main className="bg-background flex-1 overflow-y-auto">{children}</main>
      </div>
      <Toaster richColors position="top-center" />
    </div>
  );
}
