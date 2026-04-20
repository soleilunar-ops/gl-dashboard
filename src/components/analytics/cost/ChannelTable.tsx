"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { calcMargin, type MarginInput } from "./_hooks/useMarginCalc";
import type { ChannelRate } from "./_hooks/useChannelRates";

type Props = {
  rates: ChannelRate[];
  /** channelPayoutRate는 각 채널 값으로 덮어쓰므로 MarginInput 그대로 수용 */
  baseInput: MarginInput;
};

type Row = {
  channel: string;
  payoutRate: number;
  recommendedPriceVAT: number;
  unitProfit: number;
  actualMargin: number;
  isMarginAlert: boolean;
  isInfeasible: boolean;
};

/** 채널별 마진 테이블 — 변경 이유: 단일 목표 마진 기준 일괄 비교 */
export default function ChannelTable({ rates, baseInput }: Props) {
  const rows: Row[] = useMemo(() => {
    return rates
      .map((ch) => {
        const r = calcMargin({ ...baseInput, channelPayoutRate: ch.payoutRate });
        return {
          channel: ch.channelName,
          payoutRate: ch.payoutRate,
          recommendedPriceVAT: r.recommendedPriceVAT,
          unitProfit: r.unitProfit,
          actualMargin: r.actualMargin,
          isMarginAlert: r.isMarginAlert,
          isInfeasible: r.isInfeasible,
        };
      })
      .sort((a, b) => b.actualMargin - a.actualMargin);
  }, [rates, baseInput]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">채널별 권장가 · 마진</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>채널명</TableHead>
              <TableHead className="text-right">수수료율</TableHead>
              <TableHead className="text-right">권장가 (VAT 포함)</TableHead>
              <TableHead className="text-right">개당 순익</TableHead>
              <TableHead className="text-right">마진율</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.channel} className={row.isMarginAlert ? "bg-red-50" : ""}>
                <TableCell className="font-medium">{row.channel}</TableCell>
                <TableCell className="text-right">{(row.payoutRate * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right">
                  {row.isInfeasible
                    ? "—"
                    : `${Math.round(row.recommendedPriceVAT).toLocaleString("ko-KR")}원`}
                </TableCell>
                <TableCell className="text-right">
                  {row.isInfeasible
                    ? "—"
                    : `${Math.round(row.unitProfit).toLocaleString("ko-KR")}원`}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {row.isInfeasible ? "달성 불가" : `${(row.actualMargin * 100).toFixed(1)}%`}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  채널 데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
