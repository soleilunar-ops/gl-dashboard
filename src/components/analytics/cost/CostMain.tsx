"use client";

// 마진 산출 페이지 (지호 v0.5) — 단순화된 9필드 입력 + 현재가 진단
import { useEffect, useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChannelMarginChart from "./ChannelMarginChart";
import ChannelTable from "./ChannelTable";
import CurrentPriceCard from "./CurrentPriceCard";
import InputPanel, { type InputState } from "./InputPanel";
import { useChannelRates } from "./_hooks/useChannelRates";
import { useExchangeRate } from "./_hooks/useExchangeRate";
import { useMarginCalc, type MarginInput } from "./_hooks/useMarginCalc";
import { useProducts, type Product } from "./_hooks/useProducts";

const INITIAL_INPUT: InputState = {
  cnyUnitPrice: 0,
  exchangeRate: 0,
  unitCost: 0,
  sellingPriceVAT: 0,
  selectedChannel: "쿠팡 로켓배송",
  targetMargin: 0.1,
  palletReworkFee: 25000,
  otherCostPerUnit: 0,
};

export default function CostMain() {
  const [input, setInput] = useState<InputState>(INITIAL_INPUT);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { products, isLoading: productsLoading, error: productsError, refetch } = useProducts();
  const { rate, refresh } = useExchangeRate();
  const channels = useChannelRates();

  // 환율 초기 로드 시 input 에 반영
  useEffect(() => {
    if (rate.cnyKrw !== null && input.exchangeRate === 0) {
      setInput((prev) => ({ ...prev, exchangeRate: rate.cnyKrw ?? 0 }));
    }
  }, [rate.cnyKrw, input.exchangeRate]);

  const selectedChannelRate = useMemo(() => {
    const found = channels.rates.find((c) => c.channelName === input.selectedChannel);
    return found?.payoutRate ?? channels.rates[0]?.payoutRate ?? 0;
  }, [channels.rates, input.selectedChannel]);

  const marginInput: MarginInput = useMemo(
    () => ({
      cnyUnitPrice: input.cnyUnitPrice,
      exchangeRate: input.exchangeRate,
      unitCost: input.unitCost,
      sellingPriceVAT: input.sellingPriceVAT,
      channelPayoutRate: selectedChannelRate,
      targetMargin: input.targetMargin,
      palletReworkFee: input.palletReworkFee,
      otherCostPerUnit: input.otherCostPerUnit,
    }),
    [input, selectedChannelRate]
  );

  const result = useMarginCalc(marginInput);

  return (
    <Tabs defaultValue="margin" className="gap-6">
      <TabsList>
        <TabsTrigger value="margin">마진 산출</TabsTrigger>
        <TabsTrigger value="channels">채널별 수수료</TabsTrigger>
      </TabsList>

      <TabsContent value="margin" className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InputPanel
            products={products}
            productsLoading={productsLoading}
            productsError={productsError}
            onRetryProducts={refetch}
            selectedProduct={selectedProduct}
            onSelectProduct={setSelectedProduct}
            input={input}
            setInput={setInput}
            exchange={rate}
            refreshExchange={() => void refresh()}
            channels={channels.rates}
          />
          <CurrentPriceCard result={result} />
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
