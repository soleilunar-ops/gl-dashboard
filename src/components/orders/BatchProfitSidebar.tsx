"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CENTER_RATES,
  CHANNEL_RATES,
  calcMargin,
  roundCurrency,
  type ChannelKey,
} from "@/lib/margin";
import type { ContractTableRow } from "./_hooks/buildContractRows";

interface OrderMarginSidebarProps {
  selected: ContractTableRow | null;
  exCurrent: number;
  manualCny: number;
  onManualCnyChange: (v: number) => void;
  exPI: number;
  onExPIChange: (v: number) => void;
  shipmentQty: number;
  onShipmentQtyChange: (v: number) => void;
  centerName: string;
  onCenterChange: (v: string) => void;
  pcsPerPallet: number;
  onPcsPerPalletChange: (v: number) => void;
  palletReworkCost: number;
  onPalletReworkChange: (v: number) => void;
  channel: ChannelKey;
  onChannelChange: (v: ChannelKey) => void;
}

/** 선택 계약 기준 마진 미리보기 — CNY 단가는 수동 입력(products.unit_cost 미노출 정책) */
export default function BatchProfitSidebar({
  selected,
  exCurrent,
  manualCny,
  onManualCnyChange,
  exPI,
  onExPIChange,
  shipmentQty,
  onShipmentQtyChange,
  centerName,
  onCenterChange,
  pcsPerPallet,
  onPcsPerPalletChange,
  palletReworkCost,
  onPalletReworkChange,
  channel,
  onChannelChange,
}: OrderMarginSidebarProps) {
  const margin = useMemo(() => {
    if (!selected || !Number.isFinite(manualCny) || manualCny <= 0) {
      return null;
    }
    const qTotal = selected.quantity > 0 ? selected.quantity : 1;
    return calcMargin({
      cnyCostPerUnit: manualCny,
      exPI,
      exCurrent,
      qShip: shipmentQty,
      qTotal,
      palletReworkCost,
      centerName,
      pcsPerPallet: pcsPerPallet > 0 ? pcsPerPallet : 1,
      targetMargin: 0.15,
      channel,
    });
  }, [
    channel,
    centerName,
    exCurrent,
    exPI,
    manualCny,
    palletReworkCost,
    pcsPerPallet,
    selected,
    shipmentQty,
  ]);

  if (!selected) {
    return (
      <p className="text-muted-foreground text-xs">
        계약 행을 선택하면 ExFinal·권장가(VAT 포함) 미리보기가 표시됩니다.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="font-medium">{selected.productName}</p>
        <p className="text-muted-foreground">
          전표 {selected.orderRef} · 수량 {selected.quantity.toLocaleString("ko-KR")}{" "}
          {selected.unit}
        </p>
      </div>

      <div className="grid gap-2">
        <div className="space-y-1">
          <label htmlFor="cny-cost" className="text-muted-foreground block">
            CNY 단가 (수동)
          </label>
          <Input
            id="cny-cost"
            type="number"
            step="0.01"
            min={0}
            value={manualCny || ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              onManualCnyChange(Number.isFinite(next) && next >= 0 ? next : 0);
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ex-pi" className="text-muted-foreground block">
            ExPI (CNY/KRW)
          </label>
          <Input
            id="ex-pi"
            type="number"
            step="0.1"
            value={exPI}
            onChange={(event) => {
              const next = Number(event.target.value);
              onExPIChange(Number.isFinite(next) ? next : 0);
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="q-ship" className="text-muted-foreground block">
            이번 선적 수량 (QShip)
          </label>
          <Input
            id="q-ship"
            type="number"
            min={0}
            value={shipmentQty}
            onChange={(event) => {
              const next = Number(event.target.value);
              onShipmentQtyChange(Number.isFinite(next) && next >= 0 ? next : 0);
            }}
          />
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground block">센터</span>
          <Select value={centerName} onValueChange={onCenterChange}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(CENTER_RATES).map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pcs" className="text-muted-foreground block">
            파레트당 적재수
          </label>
          <Input
            id="pcs"
            type="number"
            min={1}
            value={pcsPerPallet}
            onChange={(event) => {
              const next = Number(event.target.value);
              onPcsPerPalletChange(Number.isFinite(next) && next >= 1 ? next : 1);
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="rework" className="text-muted-foreground block">
            파레트 재작업비(원)
          </label>
          <Input
            id="rework"
            type="number"
            min={0}
            step={1000}
            value={palletReworkCost}
            onChange={(event) => {
              const next = Number(event.target.value);
              onPalletReworkChange(Number.isFinite(next) && next >= 0 ? next : 0);
            }}
          />
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground block">채널</span>
          <Select value={channel} onValueChange={(v) => onChannelChange(v as ChannelKey)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_RATES) as ChannelKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {CHANNEL_RATES[key].name} (정산{" "}
                  {Math.round(CHANNEL_RATES[key].settlementRatio * 100)}
                  %, 추정)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground text-[10px]">
        헤더 환율 ExCurrent: {exCurrent.toFixed(1)} · 쿠팡 로켓 등 수수료는 사내 추정치이며 실제와
        다를 수 있습니다.
      </p>

      {margin ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">ExFinal</span>
            <span className="font-mono">{margin.exFinal.toFixed(1)}</span>
            {margin.isMarginAlert ? (
              <Badge variant="destructive">⚠ 마진 위험 (&lt;2%)</Badge>
            ) : null}
          </div>
          <p>
            권장 판매가{" "}
            <span className="font-semibold">
              {roundCurrency(margin.suggestedPriceVAT).toLocaleString("ko-KR")}원
            </span>
            <span className="text-muted-foreground"> (VAT 포함)</span>
          </p>
          <p className="text-muted-foreground">
            개당 총원가 {roundCurrency(margin.totalCostPerUnit).toLocaleString("ko-KR")}원 · 순익{" "}
            {roundCurrency(margin.profitPerUnit).toLocaleString("ko-KR")}원 · 실마진{" "}
            {(margin.actualMargin * 100).toFixed(1)}%
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">CNY 단가를 입력하면 계산됩니다.</p>
      )}
    </div>
  );
}
