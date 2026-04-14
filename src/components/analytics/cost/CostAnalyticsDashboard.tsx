"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  CENTER_RATES,
  CHANNEL_RATES,
  calcMargin,
  calcPricePer10g,
  calcProfitWithVatPrice,
  roundCurrency,
  type ChannelKey,
} from "@/lib/margin/useMarginCalc";
import {
  ChannelMarginTable,
  MarginStrategyCards,
} from "@/components/analytics/cost/MarginStrategyCards";

const chartConfig = {
  marginRate: { label: "마진율(%)", color: "var(--chart-1)" },
  profitPerUnit: { label: "개당 순이익(원)", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function CostAnalyticsDashboard() {
  const [exPi, setExPi] = useState(193.5);
  const [exCurrent, setExCurrent] = useState(194.8);
  const [shipmentQty, setShipmentQty] = useState(292800);
  const [totalQty, setTotalQty] = useState(585600);
  const [unitCostCny, setUnitCostCny] = useState(1.42);
  const [weightGram, setWeightGram] = useState(10);
  const [currentVatPrice, setCurrentVatPrice] = useState(3900);
  const [competitorVatPrice, setCompetitorVatPrice] = useState(4100);
  const [palletReworkCost, setPalletReworkCost] = useState(25000);
  const [pcsPerPallet, setPcsPerPallet] = useState(14400);
  const [centerName, setCenterName] = useState("이천1(36)");
  const [channel, setChannel] = useState<ChannelKey>("coupang_rocket");

  const currentProfit = useMemo(
    () =>
      calcProfitWithVatPrice(
        calcMargin({
          cnyCostPerUnit: unitCostCny,
          exPI: exPi,
          exCurrent,
          qShip: shipmentQty,
          qTotal: totalQty,
          palletReworkCost,
          centerName,
          pcsPerPallet,
          targetMargin: 0.15,
          channel,
        }).totalCostPerUnit,
        currentVatPrice,
        shipmentQty,
        CHANNEL_RATES[channel].settlementRatio
      ),
    [
      centerName,
      channel,
      currentVatPrice,
      exCurrent,
      exPi,
      palletReworkCost,
      pcsPerPallet,
      shipmentQty,
      totalQty,
      unitCostCny,
    ]
  );

  const ownPricePer10g = useMemo(
    () => calcPricePer10g(currentVatPrice, weightGram),
    [currentVatPrice, weightGram]
  );
  const competitorPricePer10g = useMemo(
    () => calcPricePer10g(competitorVatPrice, weightGram),
    [competitorVatPrice, weightGram]
  );
  const canWinItemWinner = ownPricePer10g <= competitorPricePer10g;

  const exchangeRiskSeries = useMemo(() => {
    const start = Math.max(120, exCurrent - 25);
    return Array.from({ length: 11 }, (_, index) => {
      const rate = start + index * 5;
      const simulated = calcMargin({
        cnyCostPerUnit: unitCostCny,
        exPI: exPi,
        exCurrent: rate,
        qShip: shipmentQty,
        qTotal: totalQty,
        palletReworkCost,
        centerName,
        pcsPerPallet,
        targetMargin: 0.15,
        channel,
      });
      const simulatedProfit = calcProfitWithVatPrice(
        simulated.totalCostPerUnit,
        currentVatPrice,
        shipmentQty,
        CHANNEL_RATES[channel].settlementRatio
      );
      return {
        rate,
        marginRate: Number((simulatedProfit.marginRate * 100).toFixed(2)),
        profitPerUnit: roundCurrency(simulatedProfit.profitPerUnit),
      };
    });
  }, [
    centerName,
    channel,
    currentVatPrice,
    exCurrent,
    exPi,
    palletReworkCost,
    pcsPerPallet,
    shipmentQty,
    totalQty,
    unitCostCny,
  ]);

  const centerProfitSeries = useMemo(() => {
    const centers = Object.keys(CENTER_RATES).slice(0, 8);
    return centers.map((center) => {
      const cost = calcMargin({
        cnyCostPerUnit: unitCostCny,
        exPI: exPi,
        exCurrent,
        qShip: shipmentQty,
        qTotal: totalQty,
        palletReworkCost,
        centerName: center,
        pcsPerPallet,
        targetMargin: 0.15,
        channel,
      });
      const profit = calcProfitWithVatPrice(
        cost.totalCostPerUnit,
        currentVatPrice,
        shipmentQty,
        CHANNEL_RATES[channel].settlementRatio
      );
      return {
        center: center.replace(/\(.+\)/, ""),
        netProfit: roundCurrency(profit.totalProfit),
      };
    });
  }, [
    channel,
    currentVatPrice,
    exCurrent,
    exPi,
    palletReworkCost,
    pcsPerPallet,
    shipmentQty,
    totalQty,
    unitCostCny,
  ]);

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>기준값 입력</CardTitle>
          <CardDescription>Net 기준 정산(56%) 이후 VAT 10% 반영 구조를 사용합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <NumberInput label="PI 환율" value={exPi} onChange={setExPi} />
            <NumberInput label="현재 환율" value={exCurrent} onChange={setExCurrent} />
            <NumberInput label="총 계약 수량" value={totalQty} onChange={setTotalQty} />
            <NumberInput label="이번 선적 수량" value={shipmentQty} onChange={setShipmentQty} />
            <NumberInput
              label="중국 단가(CNY)"
              value={unitCostCny}
              onChange={setUnitCostCny}
              step="0.1"
            />
            <NumberInput
              label="재작업비(원)"
              value={palletReworkCost}
              onChange={setPalletReworkCost}
            />
            <NumberInput
              label="파렛트당 적재수량"
              value={pcsPerPallet}
              onChange={setPcsPerPallet}
            />
            <NumberInput label="중량(g)" value={weightGram} onChange={setWeightGram} />
            <NumberInput
              label="현재 판매가(VAT포함)"
              value={currentVatPrice}
              onChange={setCurrentVatPrice}
            />
            <NumberInput
              label="경쟁사 가격(VAT포함)"
              value={competitorVatPrice}
              onChange={setCompetitorVatPrice}
            />
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">센터</span>
              <Select value={centerName} onValueChange={setCenterName}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(CENTER_RATES).map((center) => (
                    <SelectItem key={center} value={center}>
                      {center}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">채널</span>
              <Select value={channel} onValueChange={(value) => setChannel(value as ChannelKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coupang_rocket">쿠팡 로켓배송</SelectItem>
                  <SelectItem value="coupang_seller">쿠팡 판매자로켓</SelectItem>
                  <SelectItem value="naver">네이버</SelectItem>
                  <SelectItem value="gmarket">지마켓</SelectItem>
                  <SelectItem value="ssg">SSG</SelectItem>
                  <SelectItem value="kakao">카카오</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>전략 추천 카드</CardTitle>
            <CardDescription>Claude 전략 카드 로직 우선 반영</CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            <MarginStrategyCards
              cnyCostPerUnit={unitCostCny}
              exPI={exPi}
              exCurrent={exCurrent}
              qShip={shipmentQty}
              qTotal={totalQty}
              palletReworkCost={palletReworkCost}
              centerName={centerName}
              pcsPerPallet={pcsPerPallet}
              channel={channel}
              competitorPrice={competitorVatPrice}
              unitSizeG={weightGram}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>경쟁사 비교 / 아이템 위너</CardTitle>
            <CardDescription>10g당 단가 기준으로 가격 경쟁력 판단</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-muted-foreground text-xs">우리 10g당 단가</p>
                <p className="text-base font-semibold">{ownPricePer10g.toFixed(1)}원</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">경쟁사 10g당 단가</p>
                <p className="text-base font-semibold">{competitorPricePer10g.toFixed(1)}원</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">아이템 위너 가능성</span>
              <Badge variant={canWinItemWinner ? "default" : "destructive"}>
                {canWinItemWinner ? "확보 가능" : "가격 열위"}
              </Badge>
            </div>
            <div
              className={`rounded-lg border p-3 text-sm ${
                currentProfit.marginRate < 0.02
                  ? "border-red-500 bg-red-50 text-red-600"
                  : "text-muted-foreground"
              }`}
            >
              <p className="font-medium">환율 리스크 알림</p>
              <p className="mt-1">
                현재 순마진율: {(currentProfit.marginRate * 100).toFixed(2)}% / 개당 순이익:{" "}
                {roundCurrency(currentProfit.profitPerUnit).toLocaleString()}원
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>환율 변동에 따른 마진 추이</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ChartContainer className="h-64 w-full" config={chartConfig}>
              <AreaChart data={exchangeRiskSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="rate" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="marginRate"
                  stroke="var(--color-marginRate)"
                  fill="var(--color-marginRate)"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="profitPerUnit"
                  stroke="var(--color-profitPerUnit)"
                  fill="var(--color-profitPerUnit)"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>센터별 순이익 비교</CardTitle>
            <CardDescription>이천 vs 안성 등 물류비 편차를 반영한 총순이익</CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            <ChartContainer className="h-64 w-full" config={chartConfig}>
              <BarChart data={centerProfitSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="center" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="netProfit" fill="var(--chart-4)" radius={6} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <ChannelMarginTable
        cnyCostPerUnit={unitCostCny}
        exPI={exPi}
        exCurrent={exCurrent}
        qShip={shipmentQty}
        qTotal={totalQty}
        palletReworkCost={palletReworkCost}
        centerName={centerName}
        pcsPerPallet={pcsPerPallet}
      />
    </div>
  );
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: Dispatch<SetStateAction<number>>;
  step?: string;
}

function NumberInput({ label, value, onChange, step = "1" }: NumberInputProps) {
  return (
    <label className="space-y-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
      />
    </label>
  );
}
