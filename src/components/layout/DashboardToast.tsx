"use client";

/** 대시보드 영역에서 sonner 알림 표시용 — 변경 이유: 적재 결과 토스트 노출 */
import { Toaster } from "sonner";

export function DashboardToast() {
  return <Toaster richColors position="top-center" />;
}
