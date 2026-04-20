"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ChartContainer from "@/components/shared/ChartContainer";

import { calcMargin, type MarginInput } from "./_hooks/useMarginCalc";
import type { ChannelRate } from "./_hooks/useChannelRates";

type Props = {
  rates: ChannelRate[];
  /** channelPayoutRate는 각 채널 값으로 덮어쓰므로 MarginInput 그대로 수용 */
  baseInput: MarginInput;
};

type ChartRow = {
  channel: string;
  marginPct: number;
  alert: boolean;
};

/** 채널별 마진율 가로 막대 차트 — 변경 이유: 전 채널 동시 비교 */
export default function ChannelMarginChart({ rates, baseInput }: Props) {
  const data: ChartRow[] = useMemo(() => {
    return rates
      .map((ch) => {
        const r = calcMargin({ ...baseInput, channelPayoutRate: ch.payoutRate });
        return {
          channel: ch.channelName,
          marginPct: r.isInfeasible ? 0 : Number((r.actualMargin * 100).toFixed(1)),
          alert: r.isMarginAlert || r.isInfeasible,
        };
      })
      .sort((a, b) => b.marginPct - a.marginPct);
  }, [rates, baseInput]);

  return (
    <ChartContainer title="채널별 마진율">
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, "dataMax + 5"]} unit="%" />
          <YAxis type="category" dataKey="channel" width={120} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "마진율"]} />
          <ReferenceLine x={2} stroke="#ef4444" strokeDasharray="4 4" />
          <Bar dataKey="marginPct" radius={[0, 4, 4, 0]}>
            {data.map((row, idx) => (
              <Cell key={`cell-${idx}`} fill={row.alert ? "#ef4444" : "#10b981"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
