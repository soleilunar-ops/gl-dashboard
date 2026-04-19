"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Sparkles } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { CoupangInventoryByCenterRow } from "./_hooks/useCoupangInventoryByCenter";
import {
  analyzeOutboundDrop,
  type CoupangSkuInsightFacts,
} from "@/lib/logistics/coupangSkuInsightRules";
import { stripAiMarkdownNoise } from "@/lib/logistics/stripAiMarkdownNoise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DialogOnOpenChange = NonNullable<ComponentProps<typeof Dialog>["onOpenChange"]>;

type SeriesRow = {
  op_date: string;
  current_stock: number;
  outbound_qty: number;
  inbound_qty: number;
  is_stockout: boolean;
};

/** AI 서술을 문단 단위로 나누어 줄바꿈 가독성을 맞춘다 */
function narrativeParagraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function axisLabel(iso: string): string {
  try {
    return format(parseISO(iso), "M/d", { locale: ko });
  } catch {
    return iso;
  }
}

function countStockoutStreakFromEnd(rows: SeriesRow[]): number {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].is_stockout) n += 1;
    else break;
  }
  return n;
}

function buildFacts(
  row: CoupangInventoryByCenterRow,
  series: SeriesRow[],
  glStock: number | null,
  glBaseCost: number | null,
  barcode: string | null
): CoupangSkuInsightFacts {
  const totalIn = series.reduce((s, r) => s + (r.inbound_qty ?? 0), 0);
  const totalOut = series.reduce((s, r) => s + (r.outbound_qty ?? 0), 0);
  const days = series.length;
  const avgIn = days > 0 ? totalIn / days : 0;
  const avg = days > 0 ? totalOut / days : 0;
  const streak = countStockoutStreakFromEnd(series);
  const from = series.length > 0 ? series[0].op_date : null;
  const to = series.length > 0 ? series[series.length - 1].op_date : null;
  const displayName = row.sku_name?.trim() || row.item_name_raw?.trim() || `SKU ${row.sku_id}`;

  const drop = analyzeOutboundDrop(
    series.map((r) => ({ op_date: r.op_date, outbound_qty: r.outbound_qty }))
  );

  return {
    displayName,
    sku_id: row.sku_id,
    center: row.center,
    barcode,
    purchase_cost: row.purchase_cost,
    gl_mapped: row.item_id !== null,
    gl_stock: glStock,
    gl_base_cost: glBaseCost,
    bundle_ratio: row.bundle_ratio,
    coupang_current_stock: row.current_stock,
    coupang_is_stockout: row.is_stockout,
    order_status: row.order_status,
    order_status_detail: row.order_status_detail,
    chart_from: from,
    chart_to: to,
    chart_day_count: days,
    total_inbound_in_range: totalIn,
    avg_daily_inbound: avgIn,
    total_outbound_in_range: totalOut,
    avg_daily_outbound: avg,
    stockout_streak_days: streak,
    outbound_drop_detected: drop.detected,
    outbound_drop_boundary_date: drop.boundary_op_date,
    outbound_early_avg: days >= 14 ? drop.early_avg : null,
    outbound_late_avg: days >= 14 ? drop.late_avg : null,
    outbound_late_to_early_ratio: drop.late_to_early_ratio,
  };
}

type CoupangSkuAnalysisDialogProps = {
  row: CoupangInventoryByCenterRow | null;
  open: boolean;
  onOpenChange: DialogOnOpenChange;
};

export function CoupangSkuAnalysisDialog({
  row,
  open,
  onOpenChange,
}: CoupangSkuAnalysisDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [glStock, setGlStock] = useState<number | null>(null);
  const [glBaseCost, setGlBaseCost] = useState<number | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const prevChartLoadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    setLoadError(null);
    setSeries([]);
    setGlStock(null);
    setGlBaseCost(null);
    setBarcode(null);
    setAiText(null);

    try {
      let invQuery = supabase
        .from("inventory_operation")
        .select("op_date, current_stock, outbound_qty, inbound_qty, is_stockout")
        .eq("sku_id", row.sku_id)
        .order("op_date", { ascending: true })
        .limit(400);

      invQuery =
        row.center_query === null
          ? invQuery.is("center", null)
          : invQuery.eq("center", row.center_query);

      const glPromise =
        row.item_id !== null
          ? supabase
              .from("v_current_stock")
              .select("current_stock, base_cost")
              .eq("item_id", row.item_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null as null });

      const skuPromise = supabase
        .from("sku_master")
        .select("barcode")
        .eq("sku_id", row.sku_id)
        .maybeSingle();

      const [{ data: invData, error: invErr }, glRes, skuRes] = await Promise.all([
        invQuery,
        glPromise,
        skuPromise,
      ]);

      if (invErr) {
        setLoadError(invErr.message);
        return;
      }

      const list: SeriesRow[] = (invData ?? []).map((r) => ({
        op_date: r.op_date,
        current_stock: r.current_stock ?? 0,
        outbound_qty: r.outbound_qty ?? 0,
        inbound_qty: r.inbound_qty ?? 0,
        is_stockout: r.is_stockout === true,
      }));

      setSeries(list);

      if (glRes.error) {
        setLoadError(glRes.error.message);
        return;
      }
      if (glRes.data) {
        setGlStock(glRes.data.current_stock ?? null);
        setGlBaseCost(glRes.data.base_cost ?? null);
      }

      if (!skuRes.error && skuRes.data?.barcode) {
        setBarcode(skuRes.data.barcode);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [row, supabase]);

  useEffect(() => {
    if (open && row) void load();
  }, [open, row, load]);

  useEffect(() => {
    if (!open || !row) {
      prevChartLoadingRef.current = false;
    }
  }, [open, row]);

  const chartData = useMemo(
    () =>
      series.map((r) => ({
        label: axisLabel(r.op_date),
        op_date: r.op_date,
        stock: r.current_stock,
        inbound: r.inbound_qty,
        outbound: r.outbound_qty,
      })),
    [series]
  );

  const displayTitle =
    row?.sku_name?.trim() || row?.item_name_raw?.trim() || (row ? `SKU ${row.sku_id}` : "");
  const costLabel =
    row?.purchase_cost !== null && row?.purchase_cost !== undefined && row.purchase_cost > 0
      ? `${row.purchase_cost.toLocaleString("ko-KR")}원`
      : "—";

  const handleAi = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!row) return;
      const facts = buildFacts(row, series, glStock, glBaseCost, barcode);
      setAiLoading(true);
      setAiText(null);
      try {
        const res = await fetch("/api/logistics/coupang-sku-narrative", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ facts }),
        });
        const json = (await res.json()) as { narrative?: string; error?: string };
        if (!res.ok) {
          toast.error(json.error ?? "재고 현황 분석을 불러오지 못했습니다.");
          return;
        }
        if (json.narrative) {
          setAiText(stripAiMarkdownNoise(json.narrative));
          if (!opts?.silent) {
            toast.success("재고 현황 분석을 불러왔습니다.");
          }
        }
      } catch {
        toast.error("네트워크 오류");
      } finally {
        setAiLoading(false);
      }
    },
    [row, series, glStock, glBaseCost, barcode]
  );

  useEffect(() => {
    if (!open || !row) return;
    const wasLoading = prevChartLoadingRef.current;
    prevChartLoadingRef.current = loading;
    if (loadError) return;
    if (wasLoading && !loading) {
      void handleAi({ silent: true });
    }
  }, [open, row, loading, loadError, handleAi]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-full flex-col gap-6 overflow-x-hidden overflow-y-auto",
          "max-w-[calc(100vw-1rem)] p-5 sm:!max-w-[min(72rem,calc(100vw-2rem))] sm:p-8"
          /* 기본 DialogContent의 sm:max-w-sm(384px)보다 우선 */
        )}
      >
        {!row ? null : (
          <>
            <DialogHeader className="gap-3 text-left sm:pr-10">
              <DialogTitle className="text-foreground pr-2 text-lg leading-snug font-semibold sm:text-xl">
                {displayTitle}
              </DialogTitle>
              <div className="text-muted-foreground space-y-1.5 text-left font-mono text-xs leading-relaxed break-words sm:text-sm">
                <p>
                  쿠팡 SKU {row.sku_id} · 센터 {row.center}
                  {row.gl_erp_code ? ` · GL품목코드 ${row.gl_erp_code}` : ""}
                </p>
                <p>
                  바코드 {barcode ?? "—"} · CSV 매입원가 {costLabel} · 기준일 {row.op_date}
                </p>
              </div>
            </DialogHeader>

            {loading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-56 w-full" />
              </div>
            ) : loadError ? (
              <p className="text-destructive text-sm" role="alert">
                {loadError}
              </p>
            ) : (
              <div className="space-y-6">
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="bg-muted/40 min-w-0 rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs sm:text-sm">지엘창고 재고</p>
                    <p className="mt-1 text-xl font-medium tabular-nums sm:text-2xl">
                      {row.item_id === null ? "—" : (glStock ?? 0).toLocaleString("ko-KR")}
                    </p>
                    {row.item_id === null ? (
                      <p className="text-muted-foreground mt-1 text-[11px]">매핑 없음</p>
                    ) : row.bundle_ratio && row.bundle_ratio > 0 && glStock !== null ? (
                      <p className="text-muted-foreground mt-1 text-[11px]">
                        세트 환산 ≈ {Math.round(glStock / row.bundle_ratio).toLocaleString("ko-KR")}
                        (번들 {row.bundle_ratio})
                      </p>
                    ) : (
                      <p className="text-muted-foreground mt-1 text-[11px]">v_current_stock</p>
                    )}
                  </div>
                  <div className="bg-muted/40 min-w-0 rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      쿠팡 {row.center} 재고
                    </p>
                    <p
                      className={`mt-1 text-xl font-medium tabular-nums sm:text-2xl ${row.is_stockout ? "text-destructive" : ""}`}
                    >
                      {row.current_stock.toLocaleString("ko-KR")}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      품절 표시: {row.is_stockout ? "예" : "아니오"}
                    </p>
                  </div>
                  <div className="bg-muted/40 min-w-0 rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      기간 총 입고
                      {series.length > 0 ? ` (${series.length}일)` : ""}
                    </p>
                    <p className="mt-1 text-xl font-medium tabular-nums sm:text-2xl">
                      {series.reduce((s, r) => s + r.inbound_qty, 0).toLocaleString("ko-KR")}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      일평균{" "}
                      {series.length > 0
                        ? (series.reduce((s, r) => s + r.inbound_qty, 0) / series.length).toFixed(1)
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-muted/40 min-w-0 rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      기간 총 출고
                      {series.length > 0 ? ` (${series.length}일)` : ""}
                    </p>
                    <p className="mt-1 text-xl font-medium tabular-nums sm:text-2xl">
                      {series.reduce((s, r) => s + r.outbound_qty, 0).toLocaleString("ko-KR")}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      일평균{" "}
                      {series.length > 0
                        ? (series.reduce((s, r) => s + r.outbound_qty, 0) / series.length).toFixed(
                            1
                          )
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-muted/40 min-w-0 rounded-lg border p-4">
                    <p className="text-muted-foreground text-xs sm:text-sm">발주 상태</p>
                    <p className="mt-1 text-sm leading-snug font-medium sm:text-base">
                      {row.order_status ?? "—"}
                      {row.order_status_detail ? ` / ${row.order_status_detail}` : ""}
                    </p>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="mb-3 text-base font-medium">
                    쿠팡 {row.center} 재고·입출고 추이
                    {series.length > 0
                      ? ` (${series[0].op_date} ~ ${series[series.length - 1].op_date})`
                      : ""}
                  </p>
                  {chartData.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border p-8 text-center text-sm sm:text-base">
                      일별 업로드가 없어 차트를 그릴 수 없습니다. CSV를 여러 기준일로 쌓으면
                      표시됩니다.
                    </p>
                  ) : (
                    <div className="h-[280px] w-full min-w-0 rounded-lg border p-3 sm:h-[320px] sm:p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={chartData}
                          margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11 }}
                            width={44}
                            label={{
                              value: "입·출고",
                              angle: -90,
                              position: "insideLeft",
                              fontSize: 11,
                            }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 11 }}
                            width={48}
                            label={{
                              value: "재고",
                              angle: 90,
                              position: "insideRight",
                              fontSize: 11,
                            }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const pl = payload[0]?.payload as { op_date?: string };
                              return (
                                <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
                                  <p className="font-medium">{pl.op_date}</p>
                                  <ul className="mt-1 space-y-0.5 tabular-nums">
                                    {payload.map((p) => {
                                      const key = String(p.dataKey ?? "");
                                      const labelMap: Record<string, string> = {
                                        inbound: "일 입고",
                                        outbound: "일 출고",
                                        stock: "현재재고",
                                      };
                                      return (
                                        <li key={key} className="flex justify-between gap-6">
                                          <span>
                                            {labelMap[key] ?? String(p.name ?? p.dataKey)}
                                          </span>
                                          <span>{Number(p.value).toLocaleString("ko-KR")}</span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              );
                            }}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="inbound"
                            name="일 입고"
                            fill="#0f766e"
                            fillOpacity={0.65}
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="outbound"
                            name="일 출고"
                            fill="#D85A30"
                            fillOpacity={0.55}
                            radius={[2, 2, 0, 0]}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="stock"
                            name="현재재고"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={{ r: 2, fill: "#2563eb" }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="bg-muted/30 rounded-lg border p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base font-semibold">재고 현황 분석</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      disabled={aiLoading}
                      onClick={() => void handleAi({ silent: false })}
                    >
                      {aiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      재고 현황 분석
                    </Button>
                  </div>
                  {aiLoading ? (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      재고 현황 분석을 생성하는 중입니다…
                    </p>
                  ) : aiText ? (
                    <div className="space-y-3 text-base leading-relaxed">
                      {narrativeParagraphs(aiText).map((para, i) => (
                        <p key={i} className="text-foreground whitespace-pre-line">
                          {para}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      분석을 불러오지 못했습니다. 오른쪽 버튼으로 다시 시도할 수 있습니다.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
