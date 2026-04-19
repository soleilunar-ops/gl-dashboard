"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ChannelMarginTable,
  MarginStrategyCards,
} from "@/components/analytics/cost/MarginStrategyCards";
import { useMarginProductOptions } from "@/components/analytics/cost/_hooks/useMarginProductOptions";
import {
  deriveCnyFromKrw,
  useProductMarginPreset,
} from "@/components/analytics/cost/_hooks/useProductMarginPreset";
import { useOrdersMarginSelectedOrder } from "@/components/analytics/cost/OrdersMarginContext";
import { useExchangeRate } from "@/components/orders/_hooks/useExchangeRate";
import { DEFAULT_PCS_PER_PALLET } from "@/components/orders/_hooks/useSkuMapping";
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
import { cn } from "@/lib/utils";

const chartConfig = {
  marginRate: { label: "마진율(%)", color: "hsl(221 83% 53%)" },
  profitPerUnit: { label: "개당 순이익(원)", color: "hsl(142 71% 36%)" },
} satisfies ChartConfig;

/** 센터 순이익 테이블 한 페이지당 행 수 */
const CENTER_TABLE_ROWS_PER_PAGE = 5;

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
    // 주문 연동 erpCode가 있으면 productOptions에서 매칭되는 itemId를 selectedItemId에 주입
    // (직접 드롭다운 선택을 아직 안 한 상태에서만 동작)
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
    // 주문 연동 item과 현재 effective item이 동일하면 주문 CNY 단가 유지 (덮어쓰기 방지)
    if (orderLinkedItemId !== null && orderLinkedItemId === effectiveItemId) return;
    if (preset.purchaseCnyPerUnit !== null) {
      setUnitCostCny(preset.purchaseCnyPerUnit);
      return;
    }
    const derived = deriveCnyFromKrw(preset.unitCostKrw, exCurrent);
    if (derived !== null) {
      setUnitCostCny(derived);
    }
    // 의도: item·프리셋이 바뀔 때만 단가 자동 주입(실시간 환율 변동으로 입력칸 덮어쓰기 방지)
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

          <section className="space-y-3">
            <IoBlockHeader variant="in" title="조건 입력" />
            <div className="bg-muted/30 mb-4 rounded-lg border p-4">
              <p className="text-muted-foreground mb-2 text-xs font-medium">① 상품 선택</p>
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">
                  <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">
                    입력
                  </span>{" "}
                  ERP 품목
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
                      // itemId를 React key·value로 사용 (unique PK).
                      // erpCode는 다른 item_id와 중복 가능 (gl_pharm_erp_code/hnb_erp_code 교차).
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
                    {preset.recentAsp !== null
                      ? `${preset.recentAsp.toLocaleString("ko-KR")}원`
                      : "—"}
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
                  <NumberInput
                    label="총 계약 수량 QTotal"
                    value={totalQty}
                    onChange={setTotalQty}
                  />
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
                    이미 선적·송금 반영된 누적 수량(분자). 계약 직후면 0에 가깝게 두고 단계별로
                    키웁니다.
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
                    DB pcs_per_pallet 미입력 → 기본 {DEFAULT_PCS_PER_PALLET.toLocaleString("ko-KR")}{" "}
                    적용
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
                  <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">
                    입력
                  </span>{" "}
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
                  <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">
                    입력
                  </span>{" "}
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
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    fixedInputsOpen && "rotate-180"
                  )}
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

          <section className="border-primary bg-primary/5 rounded-lg border-2 p-5 shadow-sm">
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              핵심 결론 (목표 마진 15%)
            </p>
            <h2 className="text-lg leading-snug font-semibold">
              {displayProductName} · {channelLabel} · {centerName}
            </h2>
            <div className="mt-4 text-4xl font-bold tabular-nums sm:text-5xl">
              {recommendedPriceVat.toLocaleString("ko-KR")}
              <span className="text-2xl font-semibold sm:text-3xl">원</span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">VAT 포함 · 권장 판매가</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span>
                개당 순익{" "}
                <strong className="text-foreground font-semibold">
                  {stableProfitPerUnit.toLocaleString("ko-KR")}원
                </strong>
              </span>
              {breakevenEx !== null ? (
                <span className="text-muted-foreground">
                  환율 안전선(역산 노출가·마진 2%): 약 ₩
                  {Math.round(breakevenEx).toLocaleString("ko-KR")}/CNY
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={canWinAtRecommended ? "default" : "destructive"}>
                {canWinAtRecommended
                  ? `아이템 위너 가능 (경쟁 ${competitorVatPrice.toLocaleString("ko-KR")}원 대비)`
                  : `가격 열위 (경쟁 ${competitorVatPrice.toLocaleString("ko-KR")}원 대비)`}
              </Badge>
            </div>
          </section>

          <details className="bg-muted/20 rounded-lg border">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              세부 지표 (ExFinal·원가·역산 노출가 기준 마진) — 펼치기
            </summary>
            <div className="border-t px-4 pt-2 pb-4">
              <IoBlockHeader variant="out" title="핵심 산출 (선택 채널·기준 센터)" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <OutputMetric
                  label="분할 적용 환율 ExFinal"
                  value={`${marginSnapshot.exFinal.toFixed(2)} KRW/CNY`}
                />
                <OutputMetric
                  label="개당 총원가"
                  value={`${roundCurrency(marginSnapshot.totalCostPerUnit).toLocaleString("ko-KR")}원`}
                />
                <OutputMetric
                  label="개당 물류비"
                  value={`${roundCurrency(marginSnapshot.logisticsPerUnit).toLocaleString("ko-KR")}원`}
                />
                <OutputMetric
                  label="권장 판매가 VAT (목표마진 15%)"
                  value={`${Math.round(marginSnapshot.suggestedPriceVAT).toLocaleString("ko-KR")}원`}
                />
                <OutputMetric
                  label="역산 노출가 기준 순마진율"
                  value={`${(currentProfit.marginRate * 100).toFixed(2)}%`}
                />
                <OutputMetric
                  label="역산 노출가 기준 개당 순이익"
                  value={`${roundCurrency(currentProfit.profitPerUnit).toLocaleString("ko-KR")}원`}
                />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <details className="bg-muted/10 rounded-lg border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
          심화 분석 (BEP·전략·경쟁사·민감도·채널) — 펼치기
        </summary>
        <div className="space-y-4 border-t p-4">
          <Card size="sm" className="border-emerald-200 bg-emerald-50/40">
            <CardHeader className="pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  산출
                </Badge>
                <CardTitle className="text-base">손익분기(BEP) 요약</CardTitle>
              </div>
              <CardDescription>마진 2% 기준 — 환율·선적 수량 역산</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-3 text-sm">
              <p>
                <span className="text-muted-foreground">환율 안전선(2% 마진): </span>
                {breakevenEx !== null ? (
                  <span className="font-semibold">
                    역산 노출가 기준 약 ₩{Math.round(breakevenEx).toLocaleString("ko-KR")}/CNY 까지
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    — (계산 불가 · 구조적 적자 또는 탐색 구간 내 역산 불가)
                  </span>
                )}
              </p>
              <p>
                <span className="text-muted-foreground">선적 수량 BEP(2% 마진): </span>
                {breakevenShipQty !== null ? (
                  <span className="font-semibold">
                    약 {breakevenShipQty.toLocaleString("ko-KR")}개 (총계약{" "}
                    {totalQty.toLocaleString("ko-KR")}개 대비)
                  </span>
                ) : (
                  <span className="text-muted-foreground">— (계산 불가)</span>
                )}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card size="sm">
              <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    산출
                  </Badge>
                  <CardTitle>전략별 권장 판매가</CardTitle>
                </div>
                <CardDescription>
                  목표 마진 시나리오(보수·안정·공격)별 권장 VAT 가격
                </CardDescription>
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
                />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    산출
                  </Badge>
                  <CardTitle>가격 경쟁력 · 아이템 위너</CardTitle>
                </div>
                <CardDescription>역산 노출가·경쟁가 기준 10g당 단가 비교</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-muted-foreground text-xs">산출: 우리 10g당 단가</p>
                    <p className="text-base font-semibold">{ownPricePer10g.toFixed(1)}원</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">입력: 경쟁사 10g당 단가</p>
                    <p className="text-base font-semibold">{competitorPricePer10g.toFixed(1)}원</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">아이템 위너 가능성 (산출)</span>
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
                  <p className="font-medium">역산 노출가 기준 마진 (산출)</p>
                  <p className="mt-1">
                    순마진율: {(currentProfit.marginRate * 100).toFixed(2)}% · 개당 순이익:{" "}
                    {roundCurrency(currentProfit.profitPerUnit).toLocaleString()}원
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card size="sm">
              <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    산출
                  </Badge>
                  <CardTitle>환율 민감도 (역산 노출가 고정)</CardTitle>
                </div>
                <CardDescription>
                  입력 조건 유지 · CNY/KRW {EXCHANGE_SENSITIVITY_MIN}~{EXCHANGE_SENSITIVITY_MAX}{" "}
                  시뮬 · 좌 마진율(%) / 우 개당순이익(원)
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                <ChartContainer className="h-64 w-full" config={chartConfig}>
                  <AreaChart data={exchangeRiskSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rate" />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(v) => `${v}%`}
                      domain={["auto", "auto"]}
                      width={48}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(v) => `${Number(v).toLocaleString("ko-KR")}`}
                      width={56}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <ReferenceLine
                      yAxisId="left"
                      y={2}
                      stroke="var(--destructive)"
                      strokeDasharray="4 4"
                      label={{ value: "위험선 2%", fill: "var(--destructive)", fontSize: 11 }}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="marginRate"
                      stroke="hsl(221 83% 53%)"
                      fill="hsl(221 83% 53%)"
                      fillOpacity={0.2}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="profitPerUnit"
                      stroke="hsl(142 71% 36%)"
                      fill="hsl(142 71% 36%)"
                      fillOpacity={0.12}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    산출
                  </Badge>
                  <CardTitle>센터별 순이익 비교</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    최적: {optimalCenterName}
                  </Badge>
                </div>
                <CardDescription>
                  역산 노출가·입력 채널 기준 총순이익 · 테이블 5행 페이지 · 차트 전체 센터
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                <ChartContainer className="h-56 w-full" config={chartConfig}>
                  <BarChart data={centerProfitChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="center" />
                    <YAxis tickFormatter={(v) => `${Number(v).toLocaleString("ko-KR")}`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="netProfit" fill="var(--chart-4)" radius={6} />
                  </BarChart>
                </ChartContainer>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>납품 센터</TableHead>
                      <TableHead className="text-right">산출: 총 순이익(원)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedCenterRows.map((row, localIndex) => {
                      const globalIndex = centerTablePage * CENTER_TABLE_ROWS_PER_PAGE + localIndex;
                      const isTop = globalIndex === 0;
                      return (
                        <TableRow
                          key={row.centerKey}
                          className={isTop ? "bg-emerald-50" : undefined}
                        >
                          <TableCell className="font-medium">
                            {row.center}
                            {isTop ? (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                최적
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.netProfit.toLocaleString("ko-KR")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <p className="text-muted-foreground text-[11px]">
                    {centerProfitRows.length === 0
                      ? "—"
                      : `${centerTablePage * CENTER_TABLE_ROWS_PER_PAGE + 1}–${Math.min(
                          (centerTablePage + 1) * CENTER_TABLE_ROWS_PER_PAGE,
                          centerProfitRows.length
                        )}행 / 전체 ${centerProfitRows.length}센터 · ${centerTablePage + 1}/${centerTablePageCount}페이지`}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={centerTablePage <= 0}
                      onClick={() => setCenterTablePage((p) => Math.max(0, p - 1))}
                    >
                      이전
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={centerTablePage >= centerTablePageCount - 1}
                      onClick={() =>
                        setCenterTablePage((p) => Math.min(centerTablePageCount - 1, p + 1))
                      }
                    >
                      다음
                    </Button>
                  </div>
                </div>
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
      </details>
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
      <span className="text-muted-foreground text-xs">
        <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">입력</span> {label}
      </span>
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

function IoBlockHeader({ variant, title }: { variant: "in" | "out"; title: string }) {
  return (
    <div className="border-border mb-3 flex items-center gap-2 border-b pb-2">
      <Badge variant={variant === "in" ? "outline" : "secondary"} className="shrink-0">
        {variant === "in" ? "입력" : "산출"}
      </Badge>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

function OutputMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/80 rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-[11px] leading-tight">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
