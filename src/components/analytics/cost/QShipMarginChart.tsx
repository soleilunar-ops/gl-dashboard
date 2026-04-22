"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import ChartContainer from "@/components/shared/ChartContainer";

import { calcMargin, type MarginInput } from "./_hooks/useMarginCalc";

type Props = {
  baseInput: MarginInput;
};

type Point = {
  ratioPct: number;
  marginPct: number;
};

const SWEEP_STEPS = 11;

/** QShip 스위프 라인 차트 — 변경 이유: 선적 비중에 따른 마진 변화 시각화 */
export default function QShipMarginChart({ baseInput }: Props) {
  const { data, currentRatio, currentMargin } = useMemo(() => {
    const qTotal = baseInput.qTotal > 0 ? baseInput.qTotal : 0;
    const points: Point[] = [];
    for (let i = 0; i < SWEEP_STEPS; i++) {
      const ratio = i / (SWEEP_STEPS - 1);
      const qShip = qTotal * ratio;
      const r = calcMargin({ ...baseInput, qShip });
      points.push({
        ratioPct: Math.round(ratio * 100),
        marginPct: r.isInfeasible ? 0 : Number((r.actualMargin * 100).toFixed(1)),
      });
    }
    const curRatio = qTotal > 0 ? (baseInput.qShip / qTotal) * 100 : 0;
    const curCalc = calcMargin(baseInput);
    const curMargin = curCalc.isInfeasible ? 0 : Number((curCalc.actualMargin * 100).toFixed(1));
    return { data: points, currentRatio: Math.round(curRatio), currentMargin: curMargin };
  }, [baseInput]);

  return (
    <ChartContainer title="선적 비중별 마진 변화">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="ratioPct"
            unit="%"
            label={{ value: "QShip / QTotal", position: "insideBottom", offset: -5 }}
          />
          <YAxis unit="%" />
          <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "마진율"]} />
          <ReferenceLine
            y={2}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: "2%", fill: "#ef4444", fontSize: 10 }}
          />
          <Line type="monotone" dataKey="marginPct" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <ReferenceDot
            x={currentRatio}
            y={currentMargin}
            r={6}
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
