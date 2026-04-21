"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import type { OrderStatus } from "./_hooks/useOrders";

interface Props {
  status: OrderStatus;
  onStatusChange: (status: OrderStatus) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
}

/** 승인 상태 탭 + 전체 보기 — 변경 이유: 상단 건수 카드(전역 집계) UI 제거 */
export function OrdersHeader({ status, onStatusChange }: Props) {
  const showAll = status === "all";

  return (
    <div className="bg-card/95 sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-md border px-2 py-1 backdrop-blur-sm">
      <Tabs
        value={status === "all" ? "pending" : status}
        onValueChange={(v) => onStatusChange(v as OrderStatus)}
      >
        <TabsList>
          <TabsTrigger value="pending">승인대기</TabsTrigger>
          <TabsTrigger value="approved">승인완료</TabsTrigger>
          <TabsTrigger value="rejected">거절</TabsTrigger>
        </TabsList>
      </Tabs>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={showAll}
          onCheckedChange={(checked) => onStatusChange(checked ? "all" : "pending")}
        />
        전체 보기
      </label>
    </div>
  );
}
