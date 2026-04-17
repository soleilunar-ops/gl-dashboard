"use client";

import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MarginCalculator from "@/components/analytics/cost/MarginCalculator";
import { useCost, type CostHeatmapRow } from "@/components/analytics/cost/_hooks/useCost";
import { CHANNEL_RATES, type ChannelKey } from "@/lib/margin/useMarginCalc";

const CHANNEL_KEYS = Object.keys(CHANNEL_RATES) as ChannelKey[];
const TOP_N = 20;

function cellTone(marginRate: number): string {
  if (marginRate < 0.02) return "bg-red-100 text-red-800";
  if (marginRate < 0.05) return "bg-amber-50 text-amber-900";
  return "bg-emerald-50/60 text-emerald-900";
}

function heatmapToCsv(rows: CostHeatmapRow[]): string {
  const header = [
    "품목명",
    "ERP",
    "원가원",
    "참조ASP",
    "GMV90d",
    ...CHANNEL_KEYS.map((k) => CHANNEL_RATES[k].name.replace(/,/g, " ")),
  ].join(",");
  const lines = rows.map((row) => {
    const cells = [
      `"${(row.product.item_name_norm ?? row.product.item_name_raw ?? "").replace(/"/g, '""')}"`,
      row.product.category ?? "",
      row.product.base_cost ?? "",
      row.referenceVatPrice ?? "",
      String(row.gmv90d),
      ...CHANNEL_KEYS.map((ch) => {
        const c = row.byChannel[ch];
        return c ? `${(c.marginRate * 100).toFixed(2)}` : "";
      }),
    ];
    return cells.join(",");
  });
  return "\uFEFF" + [header, ...lines].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** DB 원가 × 채널 정산 구조 기반 SKU×채널 마진 히트맵 (쿠팡 최근 ASP를 참조 판매가로 사용) */
export default function CostAnalyticsDashboard() {
  const { rows, loading, error, refetch } = useCost();
  const [viewMode, setViewMode] = useState<"top" | "all">("top");

  const displayRows = useMemo(
    () => (viewMode === "top" ? rows.slice(0, TOP_N) : rows),
    [rows, viewMode]
  );

  const stats = useMemo(() => {
    let withPrice = 0;
    for (const r of rows) {
      if (r.referenceVatPrice !== null && r.referenceVatPrice > 0) withPrice += 1;
    }
    return { withPrice, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4">
      <MarginCalculator />

      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>원가 분석 대시보드</CardTitle>
          <CardDescription>
            products.unit_cost를 총원가(물류 제외 근사)로 보고, coupang_performance 최근 ASP를 VAT
            포함 참조가로 쓴 뒤 채널별 정산비율로 역산한 마진율입니다. 행 정렬은 90일 GMV
            내림차순입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <Badge variant="secondary">SKU {stats.total}건</Badge>
          <Badge variant="outline">ASP 연동 {stats.withPrice}건</Badge>
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => void refetch()}
          >
            다시 불러오기
          </button>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <p className="text-destructive text-sm">
          원인: {error} — Supabase 권한·네트워크를 확인하세요.
        </p>
      ) : (
        <Card size="sm">
          <CardHeader className="pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">채널 × SKU 마진 히트맵</CardTitle>
                <CardDescription>
                  셀: 마진율(%) · 괄호 안 개당순이익(원) · 표시: GMV 상위 {TOP_N} 또는 전체
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "top" ? "default" : "outline"}
                  onClick={() => setViewMode("top")}
                >
                  Top {TOP_N}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "all" ? "default" : "outline"}
                  onClick={() => setViewMode("all")}
                >
                  전체 ({rows.length})
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" variant="outline">
                      내보내기
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        downloadCsv(
                          `cost-heatmap-top${TOP_N}-${new Date().toISOString().slice(0, 10)}.csv`,
                          heatmapToCsv(rows.slice(0, TOP_N))
                        )
                      }
                    >
                      CSV · Top {TOP_N}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        downloadCsv(
                          `cost-heatmap-all-${new Date().toISOString().slice(0, 10)}.csv`,
                          heatmapToCsv(rows)
                        )
                      }
                    >
                      CSV · 전체 {rows.length}행
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent className="max-w-[100vw] overflow-x-auto pt-3">
            <Table className="min-w-[960px] text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-background sticky left-0 z-10">품목</TableHead>
                  <TableHead className="bg-background sticky left-0 z-10">ERP</TableHead>
                  <TableHead className="text-right">GMV(90d)</TableHead>
                  <TableHead className="text-right">원가(원)</TableHead>
                  <TableHead className="text-right">참조가(ASP)</TableHead>
                  {CHANNEL_KEYS.map((ch) => (
                    <TableHead key={ch} className="text-right whitespace-nowrap">
                      {CHANNEL_RATES[ch].name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row) => (
                  <TableRow key={row.product.item_id}>
                    <TableCell className="bg-background sticky left-0 z-10 max-w-[200px] truncate font-medium">
                      {row.product.item_name_norm ?? row.product.item_name_raw ?? ""}
                    </TableCell>
                    <TableCell className="bg-background sticky left-0 z-10 font-mono text-[11px]">
                      {row.product.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.gmv90d > 0 ? row.gmv90d.toLocaleString("ko-KR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.product.base_cost !== null && row.product.base_cost !== undefined
                        ? Number(row.product.base_cost).toLocaleString("ko-KR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.referenceVatPrice !== null
                        ? row.referenceVatPrice.toLocaleString("ko-KR")
                        : "—"}
                    </TableCell>
                    {CHANNEL_KEYS.map((ch) => {
                      const cell = row.byChannel[ch];
                      return (
                        <TableCell
                          key={ch}
                          className={`text-right whitespace-nowrap ${
                            cell ? cellTone(cell.marginRate) : ""
                          }`}
                        >
                          {cell ? (
                            <>
                              {(cell.marginRate * 100).toFixed(1)}%
                              <span className="text-muted-foreground">
                                {" "}
                                ({cell.profitPerUnit.toLocaleString("ko-KR")})
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
