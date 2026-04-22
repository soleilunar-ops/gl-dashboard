"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ExchangeRate } from "./_hooks/useExchangeRate";

type Props = {
  rate: ExchangeRate;
  refresh: () => void;
};

/** 갱신 시각 → 상대 시간 표기 — 변경 이유: "방금 전 / N분 전 / N시간 전" */
function formatTimeAgo(updatedAt: Date | null, nowMs: number): string {
  if (!updatedAt) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - updatedAt.getTime()) / 1000));
  if (diffSec < 30) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}

/** 시장 조건 섹션 상단 환율 배지 — 변경 이유: 현재 환율 즉시 가독 */
export default function ExchangeRateBadge({ rate, refresh }: Props) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeAgo = formatTimeAgo(rate.updatedAt, nowMs);
  const cny = rate.cnyKrw !== null ? rate.cnyKrw.toFixed(1) : "—";
  const usd = rate.usdKrw !== null ? rate.usdKrw.toFixed(1) : "—";

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="gap-1 text-xs font-normal">
        {rate.error && <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />}
        <span>CNY {cny}</span>
        <span className="text-muted-foreground">·</span>
        <span>USD {usd}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{timeAgo}</span>
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => refresh()}
        disabled={rate.isLoading}
        aria-label="환율 새로고침"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${rate.isLoading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
