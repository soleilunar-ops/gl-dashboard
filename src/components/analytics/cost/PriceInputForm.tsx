"use client";

import { type Dispatch, type SetStateAction } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IoBlockHeader, NumberInput } from "@/components/analytics/cost/NumberInput";
import { DEFAULT_PCS_PER_PALLET } from "@/components/orders/_hooks/useSkuMapping";
import { CENTER_RATES, type ChannelKey } from "@/lib/margin/useMarginCalc";
import { cn } from "@/lib/utils";

type ProductOption = { itemId: number; erpCode: string | null; label: string };

type Preset = {
  itemId: number | null;
  pcsPerPallet: number;
  weightGram: number;
  usedPalletFallback?: boolean;
  usedWeightFallback?: boolean;
  recentAsp: number | null;
  purchaseCnyPerUnit: number | null;
  unitCostKrw: number | null;
  productName: string;
} | null;

export interface PriceInputFormProps {
  productOptions: ProductOption[];
  productOptionsLoading: boolean;
  selectedItemId: number | null;
  setSelectedItemId: (id: number | null) => void;
  preset: Preset;
  effectiveItemId: number | null;
  exPi: number;
  setExPi: Dispatch<SetStateAction<number>>;
  exCurrent: number;
  setExCurrent: Dispatch<SetStateAction<number>>;
  rateStatus: string;
  isRateLoading: boolean;
  fetchExchangeRate: () => Promise<unknown> | void;
  totalQty: number;
  setTotalQty: Dispatch<SetStateAction<number>>;
  shipmentQty: number;
  setShipmentQty: Dispatch<SetStateAction<number>>;
  unitCostCny: number;
  setUnitCostCny: Dispatch<SetStateAction<number>>;
  pcsPerPallet: number;
  setPcsPerPallet: Dispatch<SetStateAction<number>>;
  usedPalletFallback: boolean;
  weightGram: number;
  setWeightGram: Dispatch<SetStateAction<number>>;
  currentVatPrice: number;
  setCurrentVatPrice: Dispatch<SetStateAction<number>>;
  channel: ChannelKey;
  setChannel: (c: ChannelKey) => void;
  centerName: string;
  setCenterName: (c: string) => void;
  palletReworkCost: number;
  setPalletReworkCost: Dispatch<SetStateAction<number>>;
  competitorVatPrice: number;
  setCompetitorVatPrice: Dispatch<SetStateAction<number>>;
  fixedInputsOpen: boolean;
  setFixedInputsOpen: Dispatch<SetStateAction<boolean>>;
}

export function PriceInputForm({
  productOptions,
  productOptionsLoading,
  selectedItemId,
  setSelectedItemId,
  preset,
  effectiveItemId,
  exPi,
  setExPi,
  exCurrent,
  setExCurrent,
  rateStatus,
  isRateLoading,
  fetchExchangeRate,
  totalQty,
  setTotalQty,
  shipmentQty,
  setShipmentQty,
  unitCostCny,
  setUnitCostCny,
  pcsPerPallet,
  setPcsPerPallet,
  usedPalletFallback,
  weightGram,
  setWeightGram,
  currentVatPrice,
  setCurrentVatPrice,
  channel,
  setChannel,
  centerName,
  setCenterName,
  palletReworkCost,
  setPalletReworkCost,
  competitorVatPrice,
  setCompetitorVatPrice,
  fixedInputsOpen,
  setFixedInputsOpen,
}: PriceInputFormProps) {
  return (
    <section className="space-y-3">
      <IoBlockHeader variant="in" title="조건 입력" />
      <div className="bg-muted/30 mb-4 rounded-lg border p-4">
        <p className="text-muted-foreground mb-2 text-xs font-medium">① 상품 선택</p>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">
            <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">입력</span> ERP
            품목
          </span>
          <Select
            value={selectedItemId !== null ? String(selectedItemId) : undefined}
            onValueChange={(v) => setSelectedItemId(v ? Number(v) : null)}
            disabled={productOptionsLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  productOptionsLoading
                    ? "목록 불러오는 중…"
                    : "상품을 선택하면 원가·중량·적재수·참조 노출가가 채워집니다"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {productOptions.map((opt) => (
                <SelectItem key={opt.itemId} value={String(opt.itemId)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {preset && preset.itemId === effectiveItemId ? (
          <div className="text-muted-foreground mt-2 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <span>파렛트 적재: {preset.pcsPerPallet.toLocaleString("ko-KR")}개</span>
            <span>
              단품 중량: {preset.weightGram}g
              {preset.usedWeightFallback ? " (품명에서 추정 실패 → 기본값)" : ""}
            </span>
            <span>
              최근 쿠팡 ASP:{" "}
              {preset.recentAsp !== null ? `${preset.recentAsp.toLocaleString("ko-KR")}원` : "—"}
            </span>
            <span>
              CNY 단가 출처:{" "}
              {preset.purchaseCnyPerUnit !== null
                ? `매입 ${preset.purchaseCnyPerUnit} CNY`
                : preset.unitCostKrw !== null
                  ? "원화 원가÷환율 추정(프리셋 시점)"
                  : "—"}
            </span>
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground mb-2 text-xs font-medium">② 시장 조건</p>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="space-y-1">
            <NumberInput label="계약(PI) 환율 (KRW/CNY)" value={exPi} onChange={setExPi} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full text-[11px]"
              onClick={() => setExPi(exCurrent)}
            >
              PI ← 현재 환율 복사
            </Button>
          </div>
          <div className="space-y-1">
            <NumberInput
              label="현재·결제 환율 (KRW/CNY)"
              value={exCurrent}
              onChange={setExCurrent}
            />
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={isRateLoading}
                onClick={() => void fetchExchangeRate()}
              >
                {isRateLoading ? "동기화 중…" : "API 새로고침"}
              </Button>
            </div>
            <p className="text-muted-foreground text-[10px] leading-tight">{rateStatus}</p>
          </div>
          <div className="space-y-1">
            <NumberInput label="총 계약 수량 QTotal" value={totalQty} onChange={setTotalQty} />
            <p className="text-muted-foreground text-[10px] leading-tight">
              계약·발주 전체 물량(분모). ExFinal에서 선적 비중과 함께 씁니다.
            </p>
          </div>
          <div className="space-y-1">
            <NumberInput
              label="선적·반영 수량 QShip"
              value={shipmentQty}
              onChange={setShipmentQty}
            />
            <p className="text-muted-foreground text-[10px] leading-tight">
              이미 선적·송금 반영된 누적 수량(분자). 계약 직후면 0에 가깝게 두고 단계별로 키웁니다.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <NumberInput
          label="매입 단가 (CNY/개)"
          value={unitCostCny}
          onChange={setUnitCostCny}
          step="0.001"
        />
        <div className="space-y-1">
          <NumberInput
            label="1파렛트 적재 수량 (개)"
            value={pcsPerPallet}
            onChange={setPcsPerPallet}
          />
          {usedPalletFallback ? (
            <p className="text-muted-foreground text-[11px]">
              DB pcs_per_pallet 미입력 → 기본 {DEFAULT_PCS_PER_PALLET.toLocaleString("ko-KR")} 적용
            </p>
          ) : null}
        </div>
        <NumberInput label="단품 중량 (g)" value={weightGram} onChange={setWeightGram} />
        <div className="space-y-1">
          <NumberInput
            label="역산용 노출가 VAT포함 (원)"
            value={currentVatPrice}
            onChange={setCurrentVatPrice}
          />
          <p className="text-muted-foreground text-[10px] leading-tight">
            권장가가 아니라{" "}
            <strong className="text-foreground font-medium">지금 채널에 올린 가격</strong>을
            넣습니다. 이 값으로 순마진·차트를 맞춥니다.
          </p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">입력</span>{" "}
            판매 채널
          </span>
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
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">입력</span>{" "}
            납품 물류 센터
          </span>
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
      </div>

      <div className="bg-muted/20 overflow-hidden rounded-lg border">
        <button
          type="button"
          className="hover:bg-muted/40 flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium"
          onClick={() => setFixedInputsOpen((open) => !open)}
        >
          <span>
            ③ 고정 조건{" "}
            <span className="text-muted-foreground font-normal">(재작업비·경쟁사 비교)</span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 transition-transform", fixedInputsOpen && "rotate-180")}
          />
        </button>
        {fixedInputsOpen ? (
          <div className="bg-background/50 space-y-3 border-t p-3">
            <NumberInput
              label="파렛트 재작업비 (원)"
              value={palletReworkCost}
              onChange={setPalletReworkCost}
            />
            <div className="space-y-1">
              <NumberInput
                label="경쟁사 노출가 VAT포함 (원) — 10g당 비교·위너"
                value={competitorVatPrice}
                onChange={setCompetitorVatPrice}
              />
              <p className="text-muted-foreground text-[10px] leading-tight">
                권장가(안정 15%)와 10g당 단가를 맞춰 아이템 위너 가능 여부를 봅니다.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
