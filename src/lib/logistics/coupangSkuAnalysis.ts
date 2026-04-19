import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

// 순환 import 방지: 컴포넌트 훅에서 타입만 꺼내온다 (value import 금지)
import type { CoupangInventoryByCenterRow } from "@/components/logistics/_hooks/useCoupangInventoryByCenter";
import {
  analyzeOutboundDrop,
  type CoupangSkuInsightFacts,
} from "@/lib/logistics/coupangSkuInsightRules";

export type SeriesRow = {
  op_date: string;
  current_stock: number;
  outbound_qty: number;
  inbound_qty: number;
  is_stockout: boolean;
};

/** AI 서술을 문단 단위로 나누어 줄바꿈 가독성을 맞춘다 */
export function narrativeParagraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function axisLabel(iso: string): string {
  try {
    return format(parseISO(iso), "M/d", { locale: ko });
  } catch {
    return iso;
  }
}

export function countStockoutStreakFromEnd(rows: SeriesRow[]): number {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].is_stockout) n += 1;
    else break;
  }
  return n;
}

export function buildFacts(
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
