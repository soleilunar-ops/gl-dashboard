"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import ExchangeRateBadge from "./ExchangeRateBadge";
import ProductCombobox from "./ProductCombobox";
import type { ExchangeRate } from "./_hooks/useExchangeRate";
import type { ChannelRate } from "./_hooks/useChannelRates";
import type { Product } from "./_hooks/useProducts";

export type InputState = {
  exPI: number;
  exCurrent: number;
  qTotal: number;
  qShip: number;
  cnyUnitPrice: number;
  unitsPerPallet: number;
  targetMargin: number;
  referencePriceVAT: number;
  palletReworkFee: number;
  otherCostPerUnit: number;
  selectedChannel: string;
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
  channelFileName: string | null;
  channelIsCustom: boolean;
  onUploadChannelFile: (file: File) => void;
  onResetChannels: () => void;
  onDownloadChannelTemplate: () => void;
};

/** 숫자 입력 파싱 — 변경 이유: NaN 방어, 빈값은 0으로 클램프 */
function parseNumInput(v: string): number {
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 입력 패널 — 변경 이유: 상품/시장 조건/고정 조건 통합
 * state는 상위(CostMain)에서 관리, props로 내려받아 제어.
 */
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
  channelFileName,
  channelIsCustom,
  onUploadChannelFile,
  onResetChannels,
  onDownloadChannelTemplate,
}: Props) {
  const [fixedOpen, setFixedOpen] = useState(false);
  const [exCurrentManual, setExCurrentManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleField = <K extends keyof InputState>(key: K, value: InputState[K]) => {
    setInput({ ...input, [key]: value });
  };

  const handleQShipChange = (raw: string) => {
    const v = parseNumInput(raw);
    if (v > input.qTotal) {
      toast.error(
        `선적 수량은 총 계약 수량(${input.qTotal.toLocaleString("ko-KR")})을 넘을 수 없습니다.`
      );
      handleField("qShip", input.qTotal);
      return;
    }
    handleField("qShip", v);
  };

  const handleCopyPI = () => {
    if (exchange.cnyKrw === null) {
      toast.error("현재 환율이 아직 로드되지 않았습니다.");
      return;
    }
    handleField("exPI", exchange.cnyKrw);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUploadChannelFile(file);
    e.target.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>입력 조건</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="mb-3 text-sm font-semibold">① 상품 선택</h3>
          <ProductCombobox
            products={products}
            selected={selectedProduct}
            onSelect={onSelectProduct}
            isLoading={productsLoading}
            error={productsError}
            onRetry={onRetryProducts}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">② 시장 조건</h3>
            <ExchangeRateBadge rate={exchange} refresh={refreshExchange} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>계약(PI) 환율 (KRW/CNY)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={input.exPI || ""}
                  onChange={(e) => handleField("exPI", parseNumInput(e.target.value))}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleCopyPI}>
                  PI ← 현재
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>현재·결제 환율 (KRW/CNY)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={input.exCurrent || ""}
                  readOnly={!exCurrentManual}
                  onChange={(e) => handleField("exCurrent", parseNumInput(e.target.value))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExCurrentManual((v) => !v)}
                >
                  {exCurrentManual ? "자동" : "수동"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>총 계약 수량</Label>
              <Input
                type="number"
                value={input.qTotal || ""}
                onChange={(e) => handleField("qTotal", parseNumInput(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>선적·반영 수량</Label>
              <Input
                type="number"
                max={input.qTotal || undefined}
                value={input.qShip || ""}
                onChange={(e) => handleQShipChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>매입 단가 (CNY/개)</Label>
              <Input
                type="number"
                step="0.01"
                value={input.cnyUnitPrice || ""}
                onChange={(e) => handleField("cnyUnitPrice", parseNumInput(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>1파렛트 적재 수량</Label>
              <Input
                type="number"
                value={input.unitsPerPallet || ""}
                onChange={(e) => handleField("unitsPerPallet", parseNumInput(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>목표 마진율 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={input.targetMargin === 0 ? "" : (input.targetMargin * 100).toFixed(1)}
                onChange={(e) => handleField("targetMargin", parseNumInput(e.target.value) / 100)}
              />
            </div>

            <div className="space-y-2">
              <Label>역산용 노출가 VAT 포함 (원)</Label>
              <Input
                type="number"
                value={input.referencePriceVAT || ""}
                onChange={(e) => handleField("referencePriceVAT", parseNumInput(e.target.value))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>판매 채널</Label>
              <div className="flex gap-2">
                <select
                  value={input.selectedChannel}
                  onChange={(e) => handleField("selectedChannel", e.target.value)}
                  className="border-input bg-background flex h-10 flex-1 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {channels.map((c) => (
                    <option key={c.channelName} value={c.channelName}>
                      {c.channelName} ({(c.payoutRate * 100).toFixed(1)}%)
                    </option>
                  ))}
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFilePick}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="채널 수수료 엑셀 업로드"
                  title="채널 수수료 엑셀 업로드"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDownloadChannelTemplate}
                  className="text-xs"
                >
                  템플릿
                </Button>
              </div>
              {channelIsCustom && channelFileName && (
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span>📄 {channelFileName}</span>
                  <button
                    type="button"
                    onClick={onResetChannels}
                    className="hover:text-foreground inline-flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> 기본값 복원
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setFixedOpen((v) => !v)}
            className="mb-3 flex w-full items-center justify-between text-sm font-semibold"
          >
            <span>③ 고정 조건</span>
            {fixedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {fixedOpen && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>파레트 재작업비 (원)</Label>
                <Input
                  type="number"
                  value={input.palletReworkFee || ""}
                  onChange={(e) => handleField("palletReworkFee", parseNumInput(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>기타 비용 (원/개)</Label>
                <Input
                  type="number"
                  value={input.otherCostPerUnit || ""}
                  onChange={(e) => handleField("otherCostPerUnit", parseNumInput(e.target.value))}
                />
              </div>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
