"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  /** 거절 대상 order id 배열. 빈 배열이면 버튼 disabled */
  orderIds: number[];
  /** 트리거 버튼 라벨 */
  triggerLabel?: string;
  /** variant / size 등 shadcn Button 옵션 전달용 */
  triggerClassName?: string;
  /** 거절 완료 후 부모에게 알림 (재조회 등) */
  onDone?: () => void;
}

/** 거절 사유 입력 Popover — 단건 행 + 일괄 액션 공용 */
export function OrdersRejectPopover({
  orderIds,
  triggerLabel = "거절",
  triggerClassName,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = orderIds.length === 0;

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("거절 사유를 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, action: "reject", reason: trimmed }),
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(payload.error ?? payload.message ?? `HTTP ${res.status}`);
        return;
      }
      setReason("");
      setOpen(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="destructive" size="sm" disabled={disabled} className={triggerClassName}>
          {triggerLabel}
          {orderIds.length > 1 ? ` (${orderIds.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div>
            <Label htmlFor="reject-reason" className="text-sm font-medium">
              거절 사유
            </Label>
            <p className="text-muted-foreground text-xs">{orderIds.length}건을 거절합니다.</p>
          </div>
          <Input
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="거절 사유 입력"
            disabled={submitting}
          />
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
              취소
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
            >
              {submitting ? "처리중…" : "거절 확정"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
