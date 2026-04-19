"use client";

import { type Dispatch, type SetStateAction } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const chartConfig = {
  marginRate: { label: "마진율(%)", color: "hsl(221 83% 53%)" },
  profitPerUnit: { label: "개당 순이익(원)", color: "hsl(142 71% 36%)" },
} satisfies ChartConfig;

export const CENTER_TABLE_ROWS_PER_PAGE = 5;

export interface CenterProfitRow {
  centerKey: string;
  center: string;
  netProfit: number;
}

export interface CenterProfitTableProps {
  centerProfitRows: CenterProfitRow[];
  centerProfitChartData: CenterProfitRow[];
  optimalCenterName: string;
  pagedCenterRows: CenterProfitRow[];
  centerTablePage: number;
  setCenterTablePage: Dispatch<SetStateAction<number>>;
  centerTablePageCount: number;
}

export function CenterProfitTable({
  centerProfitRows,
  centerProfitChartData,
  optimalCenterName,
  pagedCenterRows,
  centerTablePage,
  setCenterTablePage,
  centerTablePageCount,
}: CenterProfitTableProps) {
  return (
    <Card size="sm">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            산출
          </Badge>
          <CardTitle>센터별 순이익 비교</CardTitle>
          <Badge variant="outline" className="text-xs">
            최적: {optimalCenterName}
          </Badge>
        </div>
        <CardDescription>
          역산 노출가·입력 채널 기준 총순이익 · 테이블 5행 페이지 · 차트 전체 센터
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <ChartContainer className="h-56 w-full" config={chartConfig}>
          <BarChart data={centerProfitChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="center" />
            <YAxis tickFormatter={(v) => `${Number(v).toLocaleString("ko-KR")}`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="netProfit" fill="var(--chart-4)" radius={6} />
          </BarChart>
        </ChartContainer>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>납품 센터</TableHead>
              <TableHead className="text-right">산출: 총 순이익(원)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedCenterRows.map((row, localIndex) => {
              const globalIndex = centerTablePage * CENTER_TABLE_ROWS_PER_PAGE + localIndex;
              const isTop = globalIndex === 0;
              return (
                <TableRow key={row.centerKey} className={isTop ? "bg-emerald-50" : undefined}>
                  <TableCell className="font-medium">
                    {row.center}
                    {isTop ? (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        최적
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.netProfit.toLocaleString("ko-KR")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <p className="text-muted-foreground text-[11px]">
            {centerProfitRows.length === 0
              ? "—"
              : `${centerTablePage * CENTER_TABLE_ROWS_PER_PAGE + 1}–${Math.min(
                  (centerTablePage + 1) * CENTER_TABLE_ROWS_PER_PAGE,
                  centerProfitRows.length
                )}행 / 전체 ${centerProfitRows.length}센터 · ${centerTablePage + 1}/${centerTablePageCount}페이지`}
          </p>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={centerTablePage <= 0}
              onClick={() => setCenterTablePage((p) => Math.max(0, p - 1))}
            >
              이전
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={centerTablePage >= centerTablePageCount - 1}
              onClick={() => setCenterTablePage((p) => Math.min(centerTablePageCount - 1, p + 1))}
            >
              다음
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
