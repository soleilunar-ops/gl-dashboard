"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ChartContainer from "@/components/shared/ChartContainer";
import { calcMargin, type AdFeeMode, type MarginInput } from "./_hooks/useMarginCalc";
import { useChannelRates } from "./_hooks/useChannelRates";

/** 물류 센터별 밀크런 단가 예시 — 변경 이유: 센터별 순익 막대 차트용 */
const LOGISTICS_CENTERS: { id: string; label: string; milkRunFeePerPallet: number }[] = [
  { id: "icn", label: "인천", milkRunFeePerPallet: 47000 },
  { id: "bus", label: "부산", milkRunFeePerPallet: 50000 },
  { id: "daegu", label: "대구", milkRunFeePerPallet: 49000 },
  { id: "gwangju", label: "광주", milkRunFeePerPallet: 52000 },
];

/** 숫자 입력 파싱 — 변경 이유: NaN 방어 */
function parseInputNumber(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** 마진 계산기 UI — 변경 이유: GL-RADS 요구 레이아웃·차트 조합 */
export function MarginCalculator() {
  const idPrefix = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    rates,
    error: channelError,
    isCustom,
    upload,
    reset,
    downloadTemplate,
  } = useChannelRates();

  const [cnyUnitPrice, setCnyUnitPrice] = useState("12");
  const [exPI, setExPI] = useState("200");
  const [exCurrent, setExCurrent] = useState("200");
  const [qShip, setQShip] = useState("1000");
  const [qTotal, setQTotal] = useState("5000");
  const [palletReworkFee, setPalletReworkFee] = useState("25000");
  const [milkRunFeePerPallet, setMilkRunFeePerPallet] = useState("50000");
  const [unitsPerPallet, setUnitsPerPallet] = useState("100");
  const [shippingFeePerUnit, setShippingFeePerUnit] = useState("0");
  const [unitWeightG, setUnitWeightG] = useState("50");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [adFeeMode, setAdFeeMode] = useState<AdFeeMode>("amount");
  const [adFeeAmount, setAdFeeAmount] = useState("500");
  const [adFeeRatePercent, setAdFeeRatePercent] = useState("5");
  const [channelKey, setChannelKey] = useState("0");
  const [centerId, setCenterId] = useState(LOGISTICS_CENTERS[0].id);
  const [tableTargetMarginPct, setTableTargetMarginPct] = useState("15");

  const selectedChannel = rates[Number(channelKey)] ?? rates[0];

  /** 센터 선택 시 밀크런 단가 필드 동기화 — 변경 이유: 센터별 순익 차트와 입력 일치 */
  useEffect(() => {
    const c = LOGISTICS_CENTERS.find((x) => x.id === centerId);
    if (c) setMilkRunFeePerPallet(String(c.milkRunFeePerPallet));
  }, [centerId]);

  const baseInput: MarginInput = useMemo(() => {
    const cny = parseInputNumber(cnyUnitPrice) ?? 0;
    const exP = parseInputNumber(exPI) ?? 0;
    const exC = parseInputNumber(exCurrent) ?? 0;
    const qs = parseInputNumber(qShip) ?? 0;
    const qt = parseInputNumber(qTotal) ?? 0;
    const pallet = parseInputNumber(palletReworkFee) ?? 25000;
    const milk = parseInputNumber(milkRunFeePerPallet) ?? 0;
    const up = parseInputNumber(unitsPerPallet) ?? 1;
    const ship = parseInputNumber(shippingFeePerUnit) ?? 0;
    const uw = parseInputNumber(unitWeightG) ?? 0;
    const comp = competitorPrice.trim() === "" ? undefined : parseInputNumber(competitorPrice);
    const payout = selectedChannel?.payoutRate ?? 0.56;

    let adFeeValue: number | undefined;
    if (adFeeMode === "amount") {
      adFeeValue = parseInputNumber(adFeeAmount) ?? 0;
    } else {
      const pct = parseInputNumber(adFeeRatePercent) ?? 0;
      adFeeValue = pct / 100;
    }

    return {
      cnyUnitPrice: cny,
      unitWeightG: uw > 0 ? uw : undefined,
      exPI: exP,
      exCurrent: exC,
      qShip: qs,
      qTotal: qt,
      palletReworkFee: pallet,
      milkRunFeePerPallet: milk,
      unitsPerPallet: up,
      shippingFeePerUnit: ship,
      adFeeMode,
      adFeeValue,
      channelPayoutRate: payout,
      targetMargin: 0.15,
      competitorPrice: comp !== undefined && comp !== null ? comp : undefined,
    };
  }, [
    cnyUnitPrice,
    exPI,
    exCurrent,
    qShip,
    qTotal,
    palletReworkFee,
    milkRunFeePerPallet,
    unitsPerPallet,
    shippingFeePerUnit,
    unitWeightG,
    competitorPrice,
    adFeeMode,
    adFeeAmount,
    adFeeRatePercent,
    selectedChannel,
  ]);

  const result20 = useMemo(() => calcMargin({ ...baseInput, targetMargin: 0.2 }), [baseInput]);
  const result15 = useMemo(() => calcMargin({ ...baseInput, targetMargin: 0.15 }), [baseInput]);
  const result05 = useMemo(() => calcMargin({ ...baseInput, targetMargin: 0.05 }), [baseInput]);

  const strategyCards = [
    { key: "c20", title: "보수 20%", result: result20, margin: 0.2 },
    { key: "c15", title: "안정 15%", result: result15, margin: 0.15 },
    { key: "c05", title: "공격 5%", result: result05, margin: 0.05 },
  ] as const;

  const tableTargetMargin = useMemo(() => {
    const p = parseInputNumber(tableTargetMarginPct);
    if (p === null || !Number.isFinite(p)) return 0.15;
    return Math.min(0.99, Math.max(0, p / 100));
  }, [tableTargetMarginPct]);

  const chartSweepData = useMemo(() => {
    const rows: { ex: number; marginPct: number }[] = [];
    for (let ex = 170; ex <= 230; ex += 5) {
      const r = calcMargin({
        ...baseInput,
        exCurrent: ex,
        targetMargin: tableTargetMargin,
      });
      rows.push({
        ex,
        marginPct: r.isInfeasible ? 0 : r.actualMargin * 100,
      });
    }
    return rows;
  }, [baseInput, tableTargetMargin]);

  const centerBarData = useMemo(() => {
    return LOGISTICS_CENTERS.map((c) => {
      const r = calcMargin({
        ...baseInput,
        milkRunFeePerPallet: c.milkRunFeePerPallet,
        targetMargin: tableTargetMargin,
      });
      return {
        name: c.label,
        profit: r.isInfeasible ? 0 : r.unitProfit,
      };
    });
  }, [baseInput, tableTargetMargin]);

  const channelRows = useMemo(() => {
    return rates.map((ch) => {
      const r = calcMargin({
        ...baseInput,
        channelPayoutRate: ch.payoutRate,
        targetMargin: tableTargetMargin,
      });
      return { channel: ch.channelName, rate: ch.payoutRate, calc: r };
    });
  }, [rates, baseInput, tableTargetMargin]);

  const showCompetitorCompare = useMemo(() => {
    const uw = parseInputNumber(unitWeightG) ?? 0;
    const cp = competitorPrice.trim() === "" ? null : parseInputNumber(competitorPrice);
    return uw > 0 && cp !== null && cp !== undefined;
  }, [unitWeightG, competitorPrice]);

  const onPickExcel = useCallback(() => fileRef.current?.click(), []);
  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) upload(f);
      e.target.value = "";
    },
    [upload]
  );

  const formatWon = (n: number) =>
    `${Math.round(n).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원`;
  const formatPct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
  const formatEx1 = (x: number) => x.toFixed(1);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GL-RADS 마진 계산 입력</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-cny`}>CNY 단가</Label>
            <Input
              id={`${idPrefix}-cny`}
              inputMode="decimal"
              value={cnyUnitPrice}
              onChange={(e) => setCnyUnitPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-expi`}>환율 PI</Label>
            <Input
              id={`${idPrefix}-expi`}
              inputMode="decimal"
              value={exPI}
              onChange={(e) => setExPI(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-exc`}>현재 환율</Label>
            <Input
              id={`${idPrefix}-exc`}
              inputMode="decimal"
              value={exCurrent}
              onChange={(e) => setExCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-qs`}>QShip</Label>
            <Input
              id={`${idPrefix}-qs`}
              inputMode="numeric"
              value={qShip}
              onChange={(e) => setQShip(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-qt`}>QTotal</Label>
            <Input
              id={`${idPrefix}-qt`}
              inputMode="numeric"
              value={qTotal}
              onChange={(e) => setQTotal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-pal`}>파레트 재작업비</Label>
            <Input
              id={`${idPrefix}-pal`}
              inputMode="numeric"
              value={palletReworkFee}
              onChange={(e) => setPalletReworkFee(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-milk`}>파레트당 밀크런비 (센터 미선택 시 수동)</Label>
            <Input
              id={`${idPrefix}-milk`}
              inputMode="numeric"
              value={milkRunFeePerPallet}
              onChange={(e) => setMilkRunFeePerPallet(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-upp`}>파레트당 적재 수</Label>
            <Input
              id={`${idPrefix}-upp`}
              inputMode="numeric"
              value={unitsPerPallet}
              onChange={(e) => setUnitsPerPallet(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-ship`}>개당 배송비</Label>
            <Input
              id={`${idPrefix}-ship`}
              inputMode="decimal"
              value={shippingFeePerUnit}
              onChange={(e) => setShippingFeePerUnit(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-wg`}>단위 중량 (g)</Label>
            <Input
              id={`${idPrefix}-wg`}
              inputMode="decimal"
              value={unitWeightG}
              onChange={(e) => setUnitWeightG(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-comp`}>경쟁사 판매가 (10g당, 선택)</Label>
            <Input
              id={`${idPrefix}-comp`}
              inputMode="decimal"
              placeholder="10g당 원화"
              value={competitorPrice}
              onChange={(e) => setCompetitorPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>물류 센터</Label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="센터" />
              </SelectTrigger>
              <SelectContent>
                {LOGISTICS_CENTERS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label} (밀크런 {c.milkRunFeePerPallet.toLocaleString("ko-KR")}원)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>채널</Label>
            <div className="flex flex-wrap gap-2">
              <Select value={channelKey} onValueChange={setChannelKey}>
                <SelectTrigger className="min-w-[220px] flex-1">
                  <SelectValue placeholder="채널 선택" />
                </SelectTrigger>
                <SelectContent>
                  {rates.map((r, i) => (
                    <SelectItem key={`${r.channelName}-${i}`} value={String(i)}>
                      {r.channelName} ({formatPct1(r.payoutRate)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onFile}
              />
              <Button type="button" variant="outline" size="sm" onClick={onPickExcel}>
                엑셀 업로드
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                템플릿 받기
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                기본값 복원
              </Button>
            </div>
            {channelError ? <p className="text-destructive text-xs">{channelError}</p> : null}
            {isCustom ? (
              <p className="text-muted-foreground text-xs">사용자 정의 채널표가 적용 중입니다.</p>
            ) : null}
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label>광고비</Label>
            <div className="flex flex-wrap items-end gap-3">
              <Select value={adFeeMode} onValueChange={(v) => setAdFeeMode(v as AdFeeMode)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">금액(원/개)</SelectItem>
                  <SelectItem value="rate">매출 비례(%)</SelectItem>
                </SelectContent>
              </Select>
              {adFeeMode === "amount" ? (
                <Input
                  className="max-w-[200px]"
                  inputMode="numeric"
                  value={adFeeAmount}
                  onChange={(e) => setAdFeeAmount(e.target.value)}
                />
              ) : (
                <Input
                  className="max-w-[200px]"
                  inputMode="decimal"
                  value={adFeeRatePercent}
                  onChange={(e) => setAdFeeRatePercent(e.target.value)}
                  placeholder="%"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium">[A] 전략별 권장가 (VAT 포함 표기)</p>
        <div className="grid gap-3 md:grid-cols-3">
          {strategyCards.map(({ key, title, result }) => (
            <Card
              key={key}
              className={result.isMarginAlert ? "border-2 border-red-500" : undefined}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{title}</CardTitle>
                  {result.isMarginAlert ? (
                    <span className="text-destructive text-xs font-semibold">⚠ 마진 위험</span>
                  ) : null}
                  {result.isInfeasible ? (
                    <span className="text-muted-foreground text-xs">달성 불가</span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Row
                  label="권장판매가 (VAT 포함)"
                  value={`${formatWon(result.recommendedPriceVAT)} (VAT 포함)`}
                />
                <Row label="개당 원가" value={formatWon(result.costTotal)} />
                <Row label="물류비(개당)" value={formatWon(result.costBreakdown.logistics)} />
                <Row label="실질 정산액" value={formatWon(result.payoutAmount)} />
                <Row label="개당 순익" value={formatWon(result.unitProfit)} />
                <Row label="적용 환율 exFinal" value={formatEx1(result.exFinal)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {showCompetitorCompare ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">[B] 경쟁사 대비 (10g당)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(() => {
              const r = result15;
              if (r.pricePer10g === undefined || r.competitorPricePer10g === undefined) {
                return <p className="text-muted-foreground">중량·경쟁사 가격을 입력해 주세요.</p>;
              }
              const win = r.isWinner === true;
              const diffPct =
                r.competitorPricePer10g > 0
                  ? (r.pricePer10g / r.competitorPricePer10g - 1) * 100
                  : 0;
              return (
                <div className="space-y-2">
                  <p>
                    우리 10g당:{" "}
                    {r.pricePer10g.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원 · 경쟁사
                    10g당:{" "}
                    {r.competitorPricePer10g.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
                    원
                  </p>
                  {win ? (
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      ✓ 위너 획득 가능
                    </p>
                  ) : (
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                      ▲ 경쟁사 대비 +{diffPct.toFixed(1)}%
                    </p>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartContainer title="[C-1] 환율 170~230 마진율 추이 (목표마진 연동)">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <Label htmlFor={`${idPrefix}-ttm`} className="whitespace-nowrap">
              차트·센터 기준 목표마진 %
            </Label>
            <Input
              id={`${idPrefix}-ttm`}
              className="h-8 w-20"
              value={tableTargetMarginPct}
              onChange={(e) => setTableTargetMarginPct(e.target.value)}
            />
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSweepData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ex" tickFormatter={(v) => String(v)} />
                <YAxis tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={((v: number) => [`${v.toFixed(1)}%`, "마진율"]) as never}
                  labelFormatter={(l) => `환율 ${l}`}
                />
                <ReferenceLine y={2} stroke="#ef4444" strokeDasharray="4 4" label="2%" />
                <Area
                  type="monotone"
                  dataKey="marginPct"
                  stroke="#2563eb"
                  fill="#93c5fd"
                  fillOpacity={0.4}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>

        <ChartContainer title="[C-2] 센터별 개당 순익">
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={centerBarData}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={56} />
                <Tooltip formatter={((v: number) => formatWon(v)) as never} />
                <Bar dataKey="profit" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            [D] 채널별 마진 (목표마진 {tableTargetMarginPct}%)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">채널</th>
                <th className="p-2">정산비율</th>
                <th className="p-2">권장가 (VAT 포함)</th>
                <th className="p-2">실제 마진율</th>
                <th className="p-2">개당 순익</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map(({ channel, rate, calc }) => {
                const bold = channel === "쿠팡 로켓배송";
                const alertRow = !calc.isInfeasible && calc.actualMargin < 0.02;
                return (
                  <tr
                    key={channel}
                    className={`border-b ${alertRow ? "bg-red-50 dark:bg-red-950/30" : ""} ${bold ? "font-bold" : ""}`}
                  >
                    <td className="p-2">{channel}</td>
                    <td className="p-2 tabular-nums">{formatPct1(rate)}</td>
                    <td className="p-2 tabular-nums">
                      {calc.isInfeasible ? "—" : formatWon(calc.recommendedPriceVAT)}
                    </td>
                    <td className="p-2 tabular-nums">
                      {calc.isInfeasible ? "—" : formatPct1(calc.actualMargin)}
                    </td>
                    <td className="p-2 tabular-nums">
                      {calc.isInfeasible ? "—" : formatWon(calc.unitProfit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
