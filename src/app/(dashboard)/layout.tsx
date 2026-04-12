import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="bg-muted/30 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
