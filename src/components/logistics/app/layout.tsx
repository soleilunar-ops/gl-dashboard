import type { ReactNode } from "react";

export default function LogisticsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  );
}
