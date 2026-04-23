"use client";

import { useEffect, useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChannelMarginChart from "./ChannelMarginChart";
import ChannelTable from "./ChannelTable";
import CurrentPriceCard from "./CurrentPriceCard";
import InputPanel, { type InputState } from "./InputPanel";
import StrategyCards from "./StrategyCards";
import { useChannelRates } from "./_hooks/useChannelRates";
import { useExchangeRate } from "./_hooks/useExchangeRate";
import { useMarginCalc, type MarginInput } from "./_hooks/useMarginCalc";
import { useProducts, type Product } from "./_hooks/useProducts";

/** 초기 입력값 — 변경 이유: 환율 로드 전에도 페이지 렌더 가능 */
const INITIAL_INPUT: InputState = {
  exPI: 0,
  exCurrent: 0,
  qTotal: 0,
  qShip: 0,
  cnyUnitPrice: 0,
  unitsPerPallet: 0,
  targetMargin: 0.1,
  referencePriceVAT: 0,
  palletReworkFee: 25000,
  otherCostPerUnit: 0,
  selectedChannel: "쿠팡 로켓배송",
};

/**
 * 마진 산출 페이지 루트 — 변경 이유: 전체 state 관리 + 하위 컴포넌트 조립
 */
export default function CostMain() {
  const [input, setInput] = useState<InputState>(INITIAL_INPUT);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [strategyTargets, setStrategyTargets] = useState<[number, number, number]>([
    0.2, 0.15, 0.05,
  ]);

  const { products, isLoading: productsLoading, error: productsError, refetch } = useProducts();
  const { rate, refresh } = useExchangeRate();
  const channels = useChannelRates();

  useEffect(() => {
    if (rate.cnyKrw !== null && input.exCurrent === 0) {
      setInput((prev) => ({ ...prev, exCurrent: rate.cnyKrw ?? 0 }));
    }
  }, [rate.cnyKrw, input.exCurrent]);

  const selectedChannelRate = useMemo(() => {
    const found = channels.rates.find((c) => c.channelName === input.selectedChannel);
    return found?.payoutRate ?? channels.rates[0]?.payoutRate ?? 0;
  }, [channels.rates, input.selectedChannel]);

  const marginInput: MarginInput = useMemo(
    () => ({
      cnyUnitPrice: input.cnyUnitPrice,
      exPI: input.exPI,
      exCurrent: input.exCurrent,
      qShip: input.qShip,
      qTotal: input.qTotal,
      palletReworkFee: input.palletReworkFee,
      unitsPerPallet: input.unitsPerPallet,
      otherCostPerUnit: input.otherCostPerUnit,
      channelPayoutRate: selectedChannelRate,
      targetMargin: input.targetMargin,
      referencePriceVAT: input.referencePriceVAT > 0 ? input.referencePriceVAT : undefined,
    }),
    [input, selectedChannelRate]
  );

  const mainResult = useMarginCalc(marginInput);

  const handleSelectProduct = (product: Product | null) => {
    setSelectedProduct(product);
    if (product) {
      setInput((prev) => ({
        ...prev,
        cnyUnitPrice: prev.cnyUnitPrice || 0,
        unitsPerPallet: product.unitsPerPallet,
      }));
    }
  };

  const handleStrategyChange = (index: 0 | 1 | 2, value: number) => {
    setStrategyTargets((prev) => {
      const next = [...prev] as [number, number, number];
      next[index] = value;
      return next;
    });
  };

  return (
    <Tabs defaultValue="margin" className="gap-6">
      <TabsList>
        <TabsTrigger value="margin">마진 산출</TabsTrigger>
        <TabsTrigger value="channels">채널별 마진</TabsTrigger>
      </TabsList>

      <TabsContent value="margin" className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InputPanel
            products={products}
            productsLoading={productsLoading}
            productsError={productsError}
            onRetryProducts={refetch}
            selectedProduct={selectedProduct}
            onSelectProduct={handleSelectProduct}
            input={input}
            setInput={setInput}
            exchange={rate}
            refreshExchange={() => void refresh()}
            channels={channels.rates}
          />

          <div className="space-y-6">
            <CurrentPriceCard
              result={mainResult}
              referencePriceVAT={input.referencePriceVAT > 0 ? input.referencePriceVAT : undefined}
            />
            <StrategyCards
              base={marginInput}
              targets={strategyTargets}
              onTargetChange={handleStrategyChange}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="channels" className="space-y-6">
        <ChannelMarginChart rates={channels.rates} baseInput={marginInput} />

        <ChannelTable
          rates={channels.rates}
          baseInput={marginInput}
          channelFileName={channels.fileName}
          channelIsCustom={channels.isCustom}
          channelError={channels.error}
          onUploadChannelFile={channels.upload}
          onResetChannels={channels.reset}
          onDownloadChannelTemplate={channels.downloadTemplate}
        />
      </TabsContent>
    </Tabs>
  );
}
