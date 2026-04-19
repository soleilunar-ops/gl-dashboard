import { useMemo } from "react";
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

import { axisLabel, type SeriesRow } from "@/lib/logistics/coupangSkuAnalysis";

type Props = {
  series: SeriesRow[];
  centerName: string;
};

export function CoupangSkuChart({ series, centerName }: Props) {
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

  return (
    <div className="min-w-0">
      <p className="mb-3 text-base font-medium">
        쿠팡 {centerName} 재고·입출고 추이
        {series.length > 0 ? ` (${series[0].op_date} ~ ${series[series.length - 1].op_date})` : ""}
      </p>
      {chartData.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-8 text-center text-sm sm:text-base">
          일별 업로드가 없어 차트를 그릴 수 없습니다. CSV를 여러 기준일로 쌓으면 표시됩니다.
        </p>
      ) : (
        <div className="h-[280px] w-full min-w-0 rounded-lg border p-3 sm:h-[320px] sm:p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
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
                              <span>{labelMap[key] ?? String(p.name ?? p.dataKey)}</span>
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
  );
}
