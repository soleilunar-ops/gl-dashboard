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

/** 차트 색상 — #A90000 수수료(진한 레드), #BBBF4E 마진(올리브), #CBD5E1 기타(그레이) */
const COLOR_FEE = "#A90000";
const COLOR_MARGIN = "#BBBF4E";
const COLOR_MARGIN_ALERT = "#EF4444";
const COLOR_REST = "#CBD5E1";

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
        <BarChart
          data={data}
          margin={{ top: 12, right: 28, left: 12, bottom: 8 }}
          barCategoryGap="35%"
        >
          <defs>
            <linearGradient id="grad-fee" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={COLOR_FEE} stopOpacity={0.95} />
              <stop offset="1" stopColor={COLOR_FEE} stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="grad-margin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={COLOR_MARGIN} stopOpacity={0.95} />
              <stop offset="1" stopColor={COLOR_MARGIN} stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="grad-margin-alert" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={COLOR_MARGIN_ALERT} stopOpacity={0.95} />
              <stop offset="1" stopColor={COLOR_MARGIN_ALERT} stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="grad-rest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={COLOR_REST} stopOpacity={0.9} />
              <stop offset="1" stopColor={COLOR_REST} stopOpacity={0.65} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="channel"
            tick={{ fontSize: 12, fill: "#475569" }}
            interval={0}
            height={36}
            tickLine={false}
            axisLine={{ stroke: "#E5E7EB" }}
          />
          <YAxis
            type="number"
            domain={[0, 100]}
            unit="%"
            tick={{ fontSize: 12, fill: "#475569" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.03)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 700, color: "#111827", marginBottom: 4 }}
            formatter={(value, name, payload) => {
              if (name === "수수료율") {
                return [`${Number(value).toFixed(1)}%`, "수수료율"];
              }
              if (name === "마진율") {
                return [`${Number(payload?.payload?.rawMarginPct ?? value).toFixed(1)}%`, "마진율"];
              }
              return [`${Number(value).toFixed(1)}%`, "기타 비중"];
            }}
          />
          <Legend
            wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
            content={() => (
              <div className="mt-2 flex flex-wrap justify-center gap-5 text-xs text-gray-700">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: COLOR_MARGIN }}
                  />
                  마진율
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: COLOR_FEE }}
                  />
                  수수료율
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: COLOR_REST }}
                  />
                  기타 비중
                </span>
              </div>
            )}
          />
          <Bar
            dataKey="feePct"
            stackId="ratio"
            name="수수료율"
            fill="url(#grad-fee)"
            maxBarSize={44}
            radius={[0, 0, 4, 4]}
          />
          <Bar
            dataKey="marginPct"
            stackId="ratio"
            name="마진율"
            maxBarSize={44}
            radius={[0, 0, 0, 0]}
          >
            {data.map((row, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={row.alert ? "url(#grad-margin-alert)" : "url(#grad-margin)"}
              />
            ))}
          </Bar>
          <Bar
            dataKey="restPct"
            stackId="ratio"
            name="기타 비중"
            fill="url(#grad-rest)"
            maxBarSize={44}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
