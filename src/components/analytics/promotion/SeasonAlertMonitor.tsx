"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  loadSeasonAlertDataset,
  type SeasonAlertPoint,
} from "@/components/analytics/promotion/dataPreprocess";

const WARNING_LINE = 16.3;
const REFERENCE_LINE = 15.57;

const chartConfig = {
  cumulativeCostRate: { label: "누적비용률", color: "#2563eb" },
} satisfies ChartConfig;

export default function SeasonAlertMonitor() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<SeasonAlertPoint[]>([]);
  const [excludedContractCount, setExcludedContractCount] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState("7");

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        setLoading(true);
        setError(null);
        const dataset = await loadSeasonAlertDataset();
        if (!mounted) return;
        setPoints(dataset.points);
        setExcludedContractCount(dataset.excludedContractCount);
      } catch (caughtError) {
        if (!mounted) return;
        setError(
          caughtError instanceof Error ? caughtError.message : "데이터를 불러오지 못했습니다."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const visiblePoints = useMemo(() => {
    const cut = Number(selectedMonth);
    return points.filter((point) => point.seasonMonthIndex <= cut);
  }, [points, selectedMonth]);

  const currentPoint = visiblePoints[visiblePoints.length - 1];
  const currentRate = currentPoint?.cumulativeCostRate ?? 0;

  const status = useMemo(() => {
    if (currentRate < REFERENCE_LINE) {
      return { label: "정상", color: "text-green-600", banner: false };
    }
    if (currentRate < WARNING_LINE) {
      return { label: "주의", color: "text-orange-500", banner: false };
    }
    return { label: "경고", color: "text-red-600", banner: true };
  }, [currentRate]);

  const firstBreachPoint = useMemo(
    () => visiblePoints.find((point) => point.cumulativeCostRate >= WARNING_LINE),
    [visiblePoints]
  );

  const marginAmount = useMemo(() => {
    if (!currentPoint) return 0;
    const warningAllowedCost = currentPoint.cumulativeSupplyAmount * (WARNING_LINE / 100);
    return warningAllowedCost - currentPoint.cumulativeTotalCost;
  }, [currentPoint]);

  const expectedEnd = useMemo(() => {
    if (!currentPoint) return "26.03";
    const remaining = 7 - currentPoint.seasonMonthIndex;
    return `26.03 (잔여 ${remaining}개월)`;
  }, [currentPoint]);

  if (loading) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>시즌 알림 모니터</CardTitle>
          <CardDescription>데이터를 불러오는 중입니다...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>시즌 알림 모니터</CardTitle>
          <CardDescription>데이터 로드 중 오류가 발생했습니다.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-red-600">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {status.banner ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          경고: 누적비용률이 1차 경고선(16.30%)을 초과했습니다.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card size="sm" className="xl:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle>Season Alert Monitor</CardTitle>
            <CardDescription>
              25시즌 누적비용률 추이 (해지 계약 제외 {excludedContractCount}건)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="w-44">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="월 선택" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {idx + 1}월차까지 보기
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ChartContainer className="h-[360px] w-full" config={chartConfig}>
              <LineChart data={visiblePoints}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="seasonMonthIndex" tickFormatter={(value) => `${value}`} />
                <YAxis tickFormatter={(value) => `${Number(value).toFixed(2)}%`} />
                <ReferenceLine
                  y={WARNING_LINE}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  label={{
                    value: "1차 경고선 16.30%",
                    position: "insideTopRight",
                    fill: "#dc2626",
                  }}
                />
                <ReferenceLine
                  y={REFERENCE_LINE}
                  stroke="#f97316"
                  strokeDasharray="6 4"
                  label={{
                    value: "2차 참고선 15.57%",
                    position: "insideBottomRight",
                    fill: "#f97316",
                  }}
                />
                {firstBreachPoint ? (
                  <>
                    <ReferenceLine
                      x={firstBreachPoint.seasonMonthIndex}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                    />
                    <ReferenceDot
                      x={firstBreachPoint.seasonMonthIndex}
                      y={firstBreachPoint.cumulativeCostRate}
                      r={5}
                      fill="#dc2626"
                      label={{ value: "이탈 감지", position: "top", fill: "#dc2626", fontSize: 12 }}
                    />
                  </>
                ) : null}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        if (name === "cumulativeCostRate") {
                          return [`${Number(value).toFixed(2)}%`, "누적비용률"];
                        }
                        return [String(value), String(name)];
                      }}
                      labelFormatter={(label, payload) => {
                        const row = payload?.[0]?.payload as SeasonAlertPoint | undefined;
                        if (!row) return `${label}월차`;
                        return `${row.seasonMonthIndex}월차 | 누적총비용 ${row.cumulativeTotalCost.toLocaleString()}원 | 누적공급가액 ${row.cumulativeSupplyAmount.toLocaleString()}원`;
                      }}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeCostRate"
                  stroke="var(--color-cumulativeCostRate)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>현재 상태</CardTitle>
            <CardDescription>선택 시점 기준 상태 패널</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">현재 누적비용률</p>
              <p className="text-lg font-semibold">{currentRate.toFixed(2)}%</p>
              <p className={`text-sm font-medium ${status.color}`}>{status.label}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">경고선까지 여유 금액</p>
              <p
                className={`font-semibold ${marginAmount >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {marginAmount >= 0 ? "+" : ""}
                {Math.round(marginAmount).toLocaleString()}원
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">남은 시즌 예상 종료 시점</p>
              <p className="font-semibold">{expectedEnd}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
