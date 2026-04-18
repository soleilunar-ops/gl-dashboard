"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrdersRejectPopover } from "./OrdersRejectPopover";

interface Props {
  selectedIds: number[];
  onActionComplete: () => void;
}

/** 일괄 액션바 — 선택된 건들에 대한 승인/거절 버튼 */
export function OrdersActionPanel({ selectedIds, onActionComplete }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = selectedIds.length === 0;

  const callStatusApi = async (path: "/api/orders/approve", action: "approve" | "unapprove") => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedIds, action }),
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(payload.error ?? payload.message ?? `HTTP ${res.status}`);
        return;
      }
      onActionComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Badge variant={disabled ? "outline" : "default"}>선택 {selectedIds.length}건</Badge>
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={disabled || submitting}
          onClick={() => callStatusApi("/api/orders/approve", "approve")}
        >
          일괄 승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || submitting}
          onClick={() => callStatusApi("/api/orders/approve", "unapprove")}
        >
          승인 취소
        </Button>
        <OrdersRejectPopover
          orderIds={selectedIds}
          triggerLabel="일괄 거절"
          onDone={onActionComplete}
        />
      </div>
    </div>
  );
}
