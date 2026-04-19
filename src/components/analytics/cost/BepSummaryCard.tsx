"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface BepSummaryCardProps {
  breakevenEx: number | null;
  breakevenShipQty: number | null;
  totalQty: number;
}

export function BepSummaryCard({ breakevenEx, breakevenShipQty, totalQty }: BepSummaryCardProps) {
  return (
    <Card size="sm" className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            산출
          </Badge>
          <CardTitle className="text-base">손익분기(BEP) 요약</CardTitle>
        </div>
        <CardDescription>마진 2% 기준 — 환율·선적 수량 역산</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-3 text-sm">
        <p>
          <span className="text-muted-foreground">환율 안전선(2% 마진): </span>
          {breakevenEx !== null ? (
            <span className="font-semibold">
              역산 노출가 기준 약 ₩{Math.round(breakevenEx).toLocaleString("ko-KR")}/CNY 까지
            </span>
          ) : (
            <span className="text-muted-foreground">
              — (계산 불가 · 구조적 적자 또는 탐색 구간 내 역산 불가)
            </span>
          )}
        </p>
        <p>
          <span className="text-muted-foreground">선적 수량 BEP(2% 마진): </span>
          {breakevenShipQty !== null ? (
            <span className="font-semibold">
              약 {breakevenShipQty.toLocaleString("ko-KR")}개 (총계약{" "}
              {totalQty.toLocaleString("ko-KR")}개 대비)
            </span>
          ) : (
            <span className="text-muted-foreground">— (계산 불가)</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
