"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BepSummaryCard } from "@/components/analytics/cost/BepSummaryCard";
import {
  CENTER_TABLE_ROWS_PER_PAGE,
  CenterProfitTable,
} from "@/components/analytics/cost/CenterProfitTable";
import { ExchangeRiskChart } from "@/components/analytics/cost/ExchangeRiskChart";
import { KeyConclusionCard } from "@/components/analytics/cost/KeyConclusionCard";
import { ChannelMarginTable } from "@/components/analytics/cost/MarginStrategyCards";
import { PriceInputForm } from "@/components/analytics/cost/PriceInputForm";
import { PricingCompetitionCards } from "@/components/analytics/cost/PricingCompetitionCards";
import { useMarginProductOptions } from "@/components/analytics/cost/_hooks/useMarginProductOptions";
import {
  deriveCnyFromKrw,
  useProductMarginPreset,
} from "@/components/analytics/cost/_hooks/useProductMarginPreset";
import { useOrdersMarginSelectedOrder } from "@/components/analytics/cost/OrdersMarginContext";
import { useExchangeRate } from "@/components/orders/_hooks/useExchangeRate";
import {
  CENTER_RATES,
  CHANNEL_RATES,
  calcBreakevenQty,
  calcBreakevenRate,
  calcMargin,
  calcPricePer10g,
  calcProfitWithVatPrice,
  EXCHANGE_SENSITIVITY_MAX,
  EXCHANGE_SENSITIVITY_MIN,
  roundCurrency,
  type ChannelKey,
} from "@/lib/margin/useMarginCalc";

export interface MarginCalculatorProps {
  selectedOrder?: {
    cnyCostPerUnit: number;
    qShip: number;
    qTotal: number;
    exPI: number | null;
    erpCode?: string | null;
  };
}

export default function MarginCalculator({
  selectedOrder: selectedOrderProp,
}: MarginCalculatorProps) {
  const fromContext = useOrdersMarginSelectedOrder();
  const selectedOrder = selectedOrderProp ?? fromContext;

  const { exCurrent, setExCurrent, rateStatus, isRateLoading, fetchExchangeRate } =
    useExchangeRate(194.8);

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [exPi, setExPi] = useState(193.5);
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
  const [centerTablePage, setCenterTablePage] = useState(0);
  /** 거의 고정 입력(재작업비·경쟁사가) 접기 */
  const [fixedInputsOpen, setFixedInputsOpen] = useState(false);

  const { options: productOptions, loading: productOptionsLoading } = useMarginProductOptions();

  /**
   * orders→cost 연동 처리 (OrdersMarginContext의 selectedOrder.erpCode).
   * 같은 erpCode가 여러 item_id에 매핑될 수 있어 productOptions에서 첫 매칭 item 사용.
   * 정확성이 중요하면 2단에서 erp_system까지 함께 전달하는 설계로 확장.
   */
  const selectedOrderErp = selectedOrder?.erpCode?.trim() ?? "";
  const orderLinkedItemId = useMemo(() => {
    if (!selectedOrderErp) return null;
    const hit = productOptions.find((o) => o.erpCode === selectedOrderErp);
    return hit?.itemId ?? null;
  }, [productOptions, selectedOrderErp]);

  const effectiveItemId = selectedItemId ?? orderLinkedItemId;
  const {
    preset,
    loading: presetLoading,
    error: presetError,
  } = useProductMarginPreset(effectiveItemId);

  useEffect(() => {
    if (!selectedOrder) return;
    setUnitCostCny(selectedOrder.cnyCostPerUnit);
    setShipmentQty(Math.max(1, Math.round(selectedOrder.qShip)));
    setTotalQty(Math.max(1, Math.round(selectedOrder.qTotal)));
    if (selectedOrder.exPI !== null) {
      setExPi(selectedOrder.exPI);
    }
    if (orderLinkedItemId !== null && selectedItemId === null) {
      setSelectedItemId(orderLinkedItemId);
    }
  }, [selectedOrder, orderLinkedItemId, selectedItemId]);

  /** 프리셋 로드 시 적재·중량·ASP 자동 주입 */
  useEffect(() => {
    if (!preset || preset.itemId !== effectiveItemId) return;
    setPcsPerPallet(preset.pcsPerPallet);
    setWeightGram(preset.weightGram);
    if (preset.recentAsp !== null) {
      setCurrentVatPrice(preset.recentAsp);
    }
  }, [preset, effectiveItemId]);

  /** 매입 CNY 또는 원화원가÷환율 역산 — 연동 주문과 item이 같으면 주문 단가만 유지 */
  useEffect(() => {
    if (!preset || preset.itemId !== effectiveItemId) return;
    if (orderLinkedItemId !== null && orderLinkedItemId === effectiveItemId) return;
    if (preset.purchaseCnyPerUnit !== null) {
      setUnitCostCny(preset.purchaseCnyPerUnit);
      return;
    }
    const derived = deriveCnyFromKrw(preset.unitCostKrw, exCurrent);
    if (derived !== null) {
      setUnitCostCny(derived);
    }
    // exCurrent는 의도적으로 deps에서 제외 — 프리셋 갱신 시점의 스냅샷만 사용
  }, [preset, effectiveItemId, orderLinkedItemId]);

  const usedPalletFallback =
    preset?.itemId === effectiveItemId && preset.usedPalletFallback === true;

  const marginInputBase = useMemo(
    () => ({
      cnyCostPerUnit: unitCostCny,
      exPI: exPi,
      qShip: shipmentQty,
      qTotal: totalQty,
      palletReworkCost,
      centerName,
      pcsPerPallet,
      targetMargin: 0.15 as const,
      channel,
    }),
    [centerName, channel, exPi, palletReworkCost, pcsPerPallet, shipmentQty, totalQty, unitCostCny]
  );

  const marginSnapshot = useMemo(
    () => calcMargin({ ...marginInputBase, exCurrent }),
    [exCurrent, marginInputBase]
  );

  const currentProfit = useMemo(
    () =>
      calcProfitWithVatPrice(
        marginSnapshot.totalCostPerUnit,
        currentVatPrice,
        shipmentQty,
        CHANNEL_RATES[channel].settlementRatio
      ),
    [channel, currentVatPrice, marginSnapshot.totalCostPerUnit, shipmentQty]
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
    const step = 5;
    const points: number[] = [];
    for (let r = EXCHANGE_SENSITIVITY_MIN; r <= EXCHANGE_SENSITIVITY_MAX; r += step) {
      points.push(r);
    }
    return points.map((rate) => {
      const simulated = calcMargin({ ...marginInputBase, exCurrent: rate });
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
  }, [channel, currentVatPrice, marginInputBase, shipmentQty]);

  const centerProfitRows = useMemo(() => {
    const centers = Object.keys(CENTER_RATES);
    const rows = centers.map((center) => {
      const cost = calcMargin({
        ...marginInputBase,
        exCurrent,
        centerName: center,
      });
      const profit = calcProfitWithVatPrice(
        cost.totalCostPerUnit,
        currentVatPrice,
        shipmentQty,
        CHANNEL_RATES[channel].settlementRatio
      );
      return {
        centerKey: center,
        center: center.replace(/\(.+\)/, ""),
        netProfit: roundCurrency(profit.totalProfit),
      };
    });
    return [...rows].sort((a, b) => b.netProfit - a.netProfit);
  }, [channel, currentVatPrice, exCurrent, marginInputBase, shipmentQty]);

  const centerProfitChartData = useMemo(() => [...centerProfitRows], [centerProfitRows]);

  const optimalCenterName = centerProfitRows[0]?.center ?? "—";

  const centerTablePageCount = Math.max(
    1,
    Math.ceil(centerProfitRows.length / CENTER_TABLE_ROWS_PER_PAGE)
  );

  const pagedCenterRows = useMemo(() => {
    const start = centerTablePage * CENTER_TABLE_ROWS_PER_PAGE;
    return centerProfitRows.slice(start, start + CENTER_TABLE_ROWS_PER_PAGE);
  }, [centerProfitRows, centerTablePage]);

  useEffect(() => {
    setCenterTablePage(0);
  }, [centerProfitRows]);

  useEffect(() => {
    if (centerTablePage > 0 && centerTablePage >= centerTablePageCount) {
      setCenterTablePage(Math.max(0, centerTablePageCount - 1));
    }
  }, [centerTablePage, centerTablePageCount]);

  const breakevenEx = useMemo(
    () => calcBreakevenRate(marginInputBase, currentVatPrice, 0.02),
    [currentVatPrice, marginInputBase]
  );
  const breakevenShipQty = useMemo(
    () => calcBreakevenQty({ ...marginInputBase, exCurrent }, currentVatPrice, 0.02),
    [currentVatPrice, exCurrent, marginInputBase]
  );

  const channelLabel = CHANNEL_RATES[channel].name;

  const displayProductName = useMemo(() => {
    if (preset && preset.itemId === effectiveItemId) return preset.productName;
    if (presetLoading && effectiveItemId !== null) return "불러오는 중…";
    if (effectiveItemId !== null && presetError) return `Item #${effectiveItemId}`;
    if (effectiveItemId !== null) return `Item #${effectiveItemId}`;
    return "상품 미선택";
  }, [preset, effectiveItemId, presetLoading, presetError]);

  const recommendedPriceVat = Math.round(marginSnapshot.suggestedPriceVAT);
  const stableProfitPerUnit = Math.round(marginSnapshot.profitPerUnit);

  const canWinAtRecommended = useMemo(() => {
    if (weightGram <= 0) return false;
    const mine = calcPricePer10g(marginSnapshot.suggestedPriceVAT, weightGram);
    const theirs = calcPricePer10g(competitorVatPrice, weightGram);
    return mine <= theirs;
  }, [competitorVatPrice, marginSnapshot.suggestedPriceVAT, weightGram]);

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader className="pb-0">
          <CardTitle>마진·최적 판매가 계산기</CardTitle>
          <CardDescription>
            <span className="text-foreground font-medium">① 상품</span>을 고르면 적재·중량·참조
            가격이 채워지고, 남은 조정은{" "}
            <span className="text-foreground font-medium">② 시장 조건(환율·수량·채널·센터)</span>{" "}
            위주로 하면 됩니다. <span className="text-foreground font-medium">③ 고정 조건</span>은
            기본 접힘입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedOrder?.exPI === null ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <Badge variant="outline" className="border-amber-600 text-amber-900">
                PI 환율 미기록
              </Badge>
              <span>
                연동 데이터에 PI 시점 환율이 없습니다. 수동으로 PI 환율을 맞추지 않으면 ExFinal
                가중이 왜곡될 수 있습니다.
              </span>
            </div>
          ) : null}

          {presetError && effectiveItemId !== null ? (
            <p className="text-destructive text-sm">{presetError}</p>
          ) : null}

          <PriceInputForm
            productOptions={productOptions}
            productOptionsLoading={productOptionsLoading}
            selectedItemId={selectedItemId}
            setSelectedItemId={setSelectedItemId}
            preset={preset}
            effectiveItemId={effectiveItemId}
            exPi={exPi}
            setExPi={setExPi}
            exCurrent={exCurrent}
            setExCurrent={setExCurrent}
            rateStatus={rateStatus}
            isRateLoading={isRateLoading}
            fetchExchangeRate={fetchExchangeRate}
            totalQty={totalQty}
            setTotalQty={setTotalQty}
            shipmentQty={shipmentQty}
            setShipmentQty={setShipmentQty}
            unitCostCny={unitCostCny}
            setUnitCostCny={setUnitCostCny}
            pcsPerPallet={pcsPerPallet}
            setPcsPerPallet={setPcsPerPallet}
            usedPalletFallback={usedPalletFallback}
            weightGram={weightGram}
            setWeightGram={setWeightGram}
            currentVatPrice={currentVatPrice}
            setCurrentVatPrice={setCurrentVatPrice}
            channel={channel}
            setChannel={setChannel}
            centerName={centerName}
            setCenterName={setCenterName}
            palletReworkCost={palletReworkCost}
            setPalletReworkCost={setPalletReworkCost}
            competitorVatPrice={competitorVatPrice}
            setCompetitorVatPrice={setCompetitorVatPrice}
            fixedInputsOpen={fixedInputsOpen}
            setFixedInputsOpen={setFixedInputsOpen}
          />

          <KeyConclusionCard
            displayProductName={displayProductName}
            channelLabel={channelLabel}
            centerName={centerName}
            recommendedPriceVat={recommendedPriceVat}
            stableProfitPerUnit={stableProfitPerUnit}
            breakevenEx={breakevenEx}
            canWinAtRecommended={canWinAtRecommended}
            competitorVatPrice={competitorVatPrice}
            marginSnapshot={marginSnapshot}
            currentProfit={currentProfit}
          />
        </CardContent>
      </Card>

      <details className="bg-muted/10 rounded-lg border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
          심화 분석 (BEP·전략·경쟁사·민감도·채널) — 펼치기
        </summary>
        <div className="space-y-4 border-t p-4">
          <BepSummaryCard
            breakevenEx={breakevenEx}
            breakevenShipQty={breakevenShipQty}
            totalQty={totalQty}
          />

          <PricingCompetitionCards
            unitCostCny={unitCostCny}
            exPi={exPi}
            exCurrent={exCurrent}
            shipmentQty={shipmentQty}
            totalQty={totalQty}
            palletReworkCost={palletReworkCost}
            centerName={centerName}
            pcsPerPallet={pcsPerPallet}
            channel={channel}
            ownPricePer10g={ownPricePer10g}
            competitorPricePer10g={competitorPricePer10g}
            canWinItemWinner={canWinItemWinner}
            currentProfit={currentProfit}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <ExchangeRiskChart exchangeRiskSeries={exchangeRiskSeries} />
            <CenterProfitTable
              centerProfitRows={centerProfitRows}
              centerProfitChartData={centerProfitChartData}
              optimalCenterName={optimalCenterName}
              pagedCenterRows={pagedCenterRows}
              centerTablePage={centerTablePage}
              setCenterTablePage={setCenterTablePage}
              centerTablePageCount={centerTablePageCount}
            />
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
      </details>
    </div>
  );
}
