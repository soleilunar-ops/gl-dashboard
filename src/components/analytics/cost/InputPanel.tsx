"use client";

// 마진 산출 입력 패널 (지호 v0.5) — 9개 필수 필드만 노출.
// 상품·단가·환율·원가·판매가·판매채널·목표 마진율·파레트재작업비·기타비용
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import ExchangeRateBadge from "./ExchangeRateBadge";
import ProductCombobox from "./ProductCombobox";
import type { ExchangeRate } from "./_hooks/useExchangeRate";
import type { ChannelRate } from "./_hooks/useChannelRates";
import type { Product } from "./_hooks/useProducts";

export type InputState = {
  cnyUnitPrice: number; // 단가 (CNY, 참조)
  exchangeRate: number; // 환율 (KRW/CNY)
  unitCost: number; // 원가 (KRW per unit)
  sellingPriceVAT: number; // 판매가 (VAT 포함)
  selectedChannel: string; // 판매채널
  targetMargin: number; // 목표 마진율
  palletReworkFee: number; // 파레트재작업비 (KRW/개)
  otherCostPerUnit: number; // 기타비용 (광고·포장, KRW/개)
};

type Props = {
  products: Product[];
  productsLoading: boolean;
  productsError: string | null;
  onRetryProducts: () => void;
  selectedProduct: Product | null;
  onSelectProduct: (product: Product | null) => void;

  input: InputState;
  setInput: (next: InputState) => void;

  exchange: ExchangeRate;
  refreshExchange: () => void;

  channels: ChannelRate[];
};

function parseNumInput(v: string): number {
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 모든 입력 필드의 공통 골격 — 라벨 20px · 인풋 40px · 힌트 16px (오와 열 정렬용) */
function Field({
  label,
  hint,
  headerRight,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {headerRight ?? null}
      </div>
      {children}
      <div className="text-muted-foreground flex h-4 items-center text-[11px]">{hint ?? null}</div>
    </div>
  );
}

export default function InputPanel({
  products,
  productsLoading,
  productsError,
  onRetryProducts,
  selectedProduct,
  onSelectProduct,
  input,
  setInput,
  exchange,
  refreshExchange,
  channels,
}: Props) {
  const handleField = <K extends keyof InputState>(key: K, value: InputState[K]) => {
    setInput({ ...input, [key]: value });
  };

  // 단가 or 환율 변경 시 원가 자동 계산 (사용자가 수동 입력했으면 그대로 둠)
  const computeCostFromCny = () => {
    const computed = Math.round(input.cnyUnitPrice * input.exchangeRate);
    if (computed > 0) handleField("unitCost", computed);
  };

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {/* 상품 */}
        <div className="space-y-2">
          <Label>상품</Label>
          <ProductCombobox
            products={products}
            selected={selectedProduct}
            onSelect={onSelectProduct}
            isLoading={productsLoading}
            error={productsError}
            onRetry={onRetryProducts}
          />
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field label="단가 (CNY)">
            <Input
              type="number"
              step="0.01"
              className="h-10"
              value={input.cnyUnitPrice || ""}
              onChange={(e) => handleField("cnyUnitPrice", parseNumInput(e.target.value))}
              onBlur={computeCostFromCny}
            />
          </Field>

          <Field
            label="환율 (KRW/CNY)"
            headerRight={<ExchangeRateBadge rate={exchange} refresh={refreshExchange} />}
          >
            <Input
              type="number"
              step="0.1"
              className="h-10"
              value={input.exchangeRate || ""}
              onChange={(e) => handleField("exchangeRate", parseNumInput(e.target.value))}
              onBlur={computeCostFromCny}
            />
          </Field>

          <Field label="원가 (KRW/개)" hint="단가 × 환율 자동 계산 · 수동 수정 가능">
            <Input
              type="number"
              className="h-10"
              value={input.unitCost || ""}
              onChange={(e) => handleField("unitCost", parseNumInput(e.target.value))}
            />
          </Field>

          <Field label="판매가 (VAT 포함, 원)">
            <Input
              type="number"
              className="h-10"
              value={input.sellingPriceVAT || ""}
              onChange={(e) => handleField("sellingPriceVAT", parseNumInput(e.target.value))}
            />
          </Field>

          <Field label="판매 채널">
            <select
              id="cost-channel-select"
              value={input.selectedChannel}
              onChange={(e) => handleField("selectedChannel", e.target.value)}
              className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {channels.map((c) => (
                <option key={c.channelName} value={c.channelName}>
                  {c.channelName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="목표 마진율 (%)">
            <Input
              type="number"
              step="0.1"
              className="h-10"
              value={input.targetMargin === 0 ? "" : (input.targetMargin * 100).toFixed(1)}
              onChange={(e) => handleField("targetMargin", parseNumInput(e.target.value) / 100)}
            />
          </Field>

          <Field label="파레트 재작업비 (원/개)">
            <Input
              type="number"
              className="h-10"
              value={input.palletReworkFee || ""}
              onChange={(e) => handleField("palletReworkFee", parseNumInput(e.target.value))}
            />
          </Field>

          <Field label="기타비용 (광고·포장, 원/개)">
            <Input
              type="number"
              className="h-10"
              value={input.otherCostPerUnit || ""}
              onChange={(e) => handleField("otherCostPerUnit", parseNumInput(e.target.value))}
            />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
