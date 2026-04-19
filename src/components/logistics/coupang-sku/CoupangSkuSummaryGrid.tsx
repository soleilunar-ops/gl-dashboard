import type { SeriesRow } from "@/lib/logistics/coupangSkuAnalysis";

import type { CoupangInventoryByCenterRow } from "../_hooks/useCoupangInventoryByCenter";

type Props = {
  row: CoupangInventoryByCenterRow;
  glStock: number | null;
  series: SeriesRow[];
};

export function CoupangSkuSummaryGrid({ row, glStock, series }: Props) {
  return (
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
        <p className="text-muted-foreground text-xs sm:text-sm">쿠팡 {row.center} 재고</p>
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
            ? (series.reduce((s, r) => s + r.outbound_qty, 0) / series.length).toFixed(1)
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
  );
}
