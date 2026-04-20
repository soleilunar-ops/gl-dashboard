"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildFacts,
  narrativeParagraphs,
  type SeriesRow,
} from "@/lib/logistics/coupangSkuAnalysis";
import { stripAiMarkdownNoise } from "@/lib/logistics/stripAiMarkdownNoise";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import type { CoupangInventoryByCenterRow } from "../_hooks/useCoupangInventoryByCenter";

import { CoupangSkuChart } from "./CoupangSkuChart";
import { CoupangSkuSummaryGrid } from "./CoupangSkuSummaryGrid";

type DialogOnOpenChange = NonNullable<ComponentProps<typeof Dialog>["onOpenChange"]>;

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
                <CoupangSkuSummaryGrid row={row} glStock={glStock} series={series} />
                <CoupangSkuChart series={series} centerName={row.center} />

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
