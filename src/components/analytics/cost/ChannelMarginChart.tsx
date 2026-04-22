"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  feePct: number;
  marginPct: number;
  restPct: number;
  rawMarginPct: number;
  alert: boolean;
};

/** 채널별 100% 누적 막대 차트 — 변경 이유: 수수료율/마진율을 업로드 데이터 기준으로 함께 비교 */
export default function ChannelMarginChart({ rates, baseInput }: Props) {
  const data: ChartRow[] = useMemo(() => {
    return rates
      .map((ch) => {
        const r = calcMargin({ ...baseInput, channelPayoutRate: ch.payoutRate });
        const rawMarginPct = r.isInfeasible ? 0 : Number((r.actualMargin * 100).toFixed(1));
        const feePct = Number(((1 - ch.payoutRate) * 100).toFixed(1));
        const safeFeePct = Math.max(0, Math.min(100, feePct));
        const safeMarginPct = Math.max(0, Math.min(100 - safeFeePct, rawMarginPct));
        return {
          channel: ch.channelName,
          feePct: safeFeePct,
          marginPct: safeMarginPct,
          restPct: Number((100 - safeFeePct - safeMarginPct).toFixed(1)),
          rawMarginPct,
          alert: r.isMarginAlert || r.isInfeasible,
        };
      })
      .sort((a, b) => b.rawMarginPct - a.rawMarginPct);
  }, [rates, baseInput]);

  return (
    <ChartContainer title="채널별 마진율">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 20, left: 20, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="channel"
            tick={{ fontSize: 12 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={56}
          />
          <YAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value, name, payload) => {
              if (name === "수수료율") {
                return [`${Number(value).toFixed(1)}%`, "수수료율"];
              }
              if (name === "마진율") {
                return [`${Number(payload?.payload?.rawMarginPct ?? value).toFixed(1)}%`, "마진율"];
              }
              return [`${Number(value).toFixed(1)}%`, "기타비중"];
            }}
          />
          <Legend />
          <Bar
            dataKey="feePct"
            stackId="ratio"
            name="수수료율"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
          />
          <Bar dataKey="marginPct" stackId="ratio" name="마진율" radius={[4, 4, 0, 0]}>
            {data.map((row, idx) => (
              <Cell key={`cell-${idx}`} fill={row.alert ? "#ef4444" : "#10b981"} />
            ))}
          </Bar>
          <Bar
            dataKey="restPct"
            stackId="ratio"
            name="기타비중"
            fill="#cbd5e1"
            radius={[0, 0, 4, 4]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
