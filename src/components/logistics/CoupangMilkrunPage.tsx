// 변경 이유: 쿠팡 밀크런 발주 관리, 일정/날씨 확인, 팔렛트·운송비 최적화를 한 화면에서 처리하도록 신규 페이지를 구성했습니다.
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CloudRain, Plus, Upload, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COUPANG_CENTERS } from "./constants/coupangCenters";
import { COUPANG_PRODUCTS } from "./constants/coupangProducts";
import { CsvImportDialog, ManualOrderDialog } from "./CoupangMilkrunDialogs";
import MilkrunCenterCalculator from "./MilkrunCenterCalculator";
import { useWeather } from "./_hooks/useWeather";
import type { PurchaseOrder } from "./types/milkrun";
import { calcPurchaseOrder } from "./utils/milkrunCalc";
import { cn } from "@/lib/utils";

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ko-KR");
}

const STORAGE_KEY = "coupang-milkrun-orders-v1";
const DEFAULT_TRUCK_CAPACITY = 33;

export default function CoupangMilkrunPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [truckCapacity, setTruckCapacity] = useState(DEFAULT_TRUCK_CAPACITY);
  const { weatherCache, fetchWeather } = useWeather();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as PurchaseOrder[];
      if (Array.isArray(parsed)) {
        setOrders(parsed);
      }
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  const calculatedOrders = useMemo(() => {
    return orders
      .map((order) => {
        try {
          return calcPurchaseOrder(order);
        } catch {
          return null;
        }
      })
      .filter((order): order is NonNullable<typeof order> => order !== null);
  }, [orders]);

  const selectedOrder = useMemo(() => {
    if (!selectedId) return calculatedOrders[0] ?? null;
    return calculatedOrders.find((order) => order.id === selectedId) ?? calculatedOrders[0] ?? null;
  }, [calculatedOrders, selectedId]);

  const consolidation = useMemo(() => {
    const totalPallets = calculatedOrders.reduce((sum, order) => sum + order.totalPallets, 0);
    if (totalPallets <= 0) {
      return {
        totalPallets: 0,
        separateTrucks: 0,
        consolidatedTrucks: 0,
        bestCenterName: "",
        bestCenterPrice: 0,
        consolidatedCost: 0,
      };
    }

    const separateTrucks = calculatedOrders.reduce(
      (sum, order) => sum + Math.ceil(order.totalPallets / Math.max(truckCapacity, 1)),
      0
    );
    const consolidatedTrucks = Math.ceil(totalPallets / Math.max(truckCapacity, 1));
    const cheapestCenter = COUPANG_CENTERS.reduce((best, center) =>
      center.price < best.price ? center : best
    );

    return {
      totalPallets,
      separateTrucks,
      consolidatedTrucks,
      bestCenterName: cheapestCenter.name,
      bestCenterPrice: cheapestCenter.price,
      consolidatedCost: totalPallets * cheapestCenter.price,
    };
  }, [calculatedOrders, truckCapacity]);

  useEffect(() => {
    if (!selectedOrder) return;
    if (!selectedId) setSelectedId(selectedOrder.id);
    void fetchWeather(selectedOrder.reworkDate);
  }, [fetchWeather, selectedId, selectedOrder]);

  const handleSaveOrder = (order: PurchaseOrder) => {
    setOrders((prev) => [order, ...prev]);
    setSelectedId(order.id);
  };

  const handleImportOrders = (nextOrders: PurchaseOrder[]) => {
    if (nextOrders.length === 0) return;
    setOrders((prev) => [...nextOrders, ...prev]);
    setSelectedId(nextOrders[0]?.id ?? null);
  };

  const updateManualPallets = (itemIndex: number, pallets: number) => {
    if (!selectedOrder || !Number.isFinite(pallets) || pallets <= 0) return;
    setOrders((prev) =>
      prev.map((order) =>
        order.id === selectedOrder.id
          ? {
              ...order,
              items: order.items.map((item, index) =>
                index === itemIndex ? { ...item, manualPallets: pallets } : item
              ),
            }
          : order
      )
    );
  };

  const applyBestCenterToAllOrders = () => {
    if (!consolidation.bestCenterName) return;
    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        centerName: consolidation.bestCenterName,
      }))
    );
  };

  const clearAllOrders = () => {
    setOrders([]);
    setSelectedId(null);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">쿠팡 밀크런 관리</h1>
          <p className="text-muted-foreground text-sm">
            발주 입력부터 재작업 일정과 밀크런 운송비를 통합 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> 수동 입력
          </Button>
          <Button variant="outline" onClick={() => setCsvOpen(true)}>
            <Upload className="h-4 w-4" /> CSV 업로드
          </Button>
          <Button variant="ghost" onClick={clearAllOrders}>
            목록 초기화
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">센터 통합 최적화(발주 리스트 기준)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <p className="text-sm">{`총 발주건: ${formatNumber(calculatedOrders.length)}건`}</p>
            <p className="text-sm">{`총 팔렛트: ${formatNumber(consolidation.totalPallets)}개`}</p>
            <p className="text-sm">{`개별 출고 차량: ${formatNumber(consolidation.separateTrucks)}대`}</p>
            <p className="text-sm">{`통합 출고 차량: ${formatNumber(consolidation.consolidatedTrucks)}대`}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">차량 1대 최대 팔렛트(운영값)</p>
              <Input
                type="number"
                min={1}
                value={truckCapacity}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setTruckCapacity(
                    Number.isFinite(value) && value > 0 ? value : DEFAULT_TRUCK_CAPACITY
                  );
                }}
                className="w-40"
              />
            </div>
            <div className="text-sm">
              <p>{`추천 통합 센터: ${consolidation.bestCenterName || "-"}`}</p>
              <p>{`센터 단가: ${formatNumber(consolidation.bestCenterPrice)}원 / 팔렛트`}</p>
              <p>{`통합 예상 운송비: ${formatNumber(consolidation.consolidatedCost)}원`}</p>
            </div>
            <Button
              type="button"
              onClick={applyBestCenterToAllOrders}
              disabled={!consolidation.bestCenterName}
            >
              <WandSparkles className="h-4 w-4" />
              추천 센터 일괄 적용
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            혼재 팔렛(다품목 합포장)은 품목별 박스 외형/허용 적재 규칙 데이터가 없어서 현재는
            미적용입니다. 지금 계산은 품목별 팔렛 적재수량 기준의 보수 계산입니다.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {calculatedOrders.map((order) => {
          const weather = weatherCache[order.reworkDate];
          return (
            <Card
              key={order.id}
              className={cn(
                "cursor-pointer border transition-colors",
                selectedOrder?.id === order.id && "ring-ring ring-2",
                weather?.data?.isRainy && "border-amber-500"
              )}
              onClick={() => setSelectedId(order.id)}
            >
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="text-base">{order.orderNumber}</CardTitle>
                <p className="text-muted-foreground text-xs">{`${order.center.name} · ${order.center.region}`}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>입고일: {order.deliveryDate}</p>
                <p>재작업일: {order.reworkDate}</p>
                <p>{`품목 ${formatNumber(order.items.length)}개 / 팔렛트 ${formatNumber(order.totalPallets)}개`}</p>
                <p>{`총 비용 ${formatNumber(order.totalCost)}원`}</p>
                <Badge variant="outline">
                  {weather?.status === "success" && weather.data
                    ? `${weather.data.emoji} ${weather.data.label} (${weather.data.pop}%)`
                    : weather?.status === "error"
                      ? "날씨 조회 실패"
                      : "날씨 조회 중"}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
        {calculatedOrders.length === 0 && (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              상단 버튼으로 발주건을 먼저 추가하세요.
            </CardContent>
          </Card>
        )}
      </section>

      {selectedOrder && (
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">작업 일정</TabsTrigger>
            <TabsTrigger value="optimize">밀크런 최적화</TabsTrigger>
            <TabsTrigger value="center-calculator">센터별 비용 계산기</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardContent className="grid gap-2 pt-6 md:grid-cols-4">
                <p>{`발주번호: ${selectedOrder.orderNumber}`}</p>
                <p>{`목적지: ${selectedOrder.center.name}`}</p>
                <p>{`재작업일: ${selectedOrder.reworkDate}`}</p>
                <p>{`입고일: ${selectedOrder.deliveryDate}`}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">재작업일 날씨</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {weatherCache[selectedOrder.reworkDate]?.status === "loading" && (
                  <p className="text-sm">날씨 불러오는 중...</p>
                )}
                {weatherCache[selectedOrder.reworkDate]?.status === "error" && (
                  <p className="text-destructive text-sm">
                    {weatherCache[selectedOrder.reworkDate]?.message ??
                      "날씨 정보를 불러올 수 없습니다. 기상청 사이트를 확인하세요."}
                  </p>
                )}
                {weatherCache[selectedOrder.reworkDate]?.status === "success" &&
                  weatherCache[selectedOrder.reworkDate]?.data && (
                    <>
                      <p className="text-lg">
                        {weatherCache[selectedOrder.reworkDate]?.data?.emoji}{" "}
                        {weatherCache[selectedOrder.reworkDate]?.data?.label} / 강수확률{" "}
                        {weatherCache[selectedOrder.reworkDate]?.data?.pop}%
                      </p>
                      {weatherCache[selectedOrder.reworkDate]?.data?.isRainy ? (
                        <div className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm">
                          <CloudRain className="h-4 w-4" />
                          {`⚠ 재작업일(${selectedOrder.reworkDate}) 우천 예상, 방수 커버 준비 또는 일정 조정을 검토하세요.`}
                        </div>
                      ) : (
                        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700">
                          ✓ 재작업일 날씨가 양호합니다.
                        </div>
                      )}
                    </>
                  )}
                <div className="bg-muted/30 flex items-center justify-between rounded-md border p-3 text-sm">
                  <span>{`[재작업일 ${selectedOrder.reworkDate}]`}</span>
                  <span>{`[D-${selectedOrder.reworkOffset}]`}</span>
                  <span>{`[입고일 ${selectedOrder.deliveryDate}]`}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="optimize" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">{`총 팔렛트: ${formatNumber(selectedOrder.totalPallets)}개`}</CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">{`총 비용: ${formatNumber(selectedOrder.totalCost)}원 (VAT 별도)`}</CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">{`센터 단가: ${formatNumber(selectedOrder.center.price)}원`}</CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>품목명</TableHead>
                      <TableHead>단위</TableHead>
                      <TableHead>발주수량</TableHead>
                      <TableHead>팔렛당 발주단위</TableHead>
                      <TableHead>적재방식</TableHead>
                      <TableHead>팔렛트 수</TableHead>
                      <TableHead>충진율</TableHead>
                      <TableHead>밀크런 비용</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.itemsCalc.map((item, index) => (
                      <TableRow key={`${item.productId}-${index}`}>
                        <TableCell>{item.itemName ?? item.product.name}</TableCell>
                        <TableCell>{`${item.product.unit}매`}</TableCell>
                        <TableCell>{formatNumber(item.orderQty)}</TableCell>
                        <TableCell>
                          {item.product.palletQty
                            ? `${formatNumber(item.product.palletQty)}팩`
                            : "⚠ 미등록"}
                        </TableCell>
                        <TableCell>{item.product.stacking || "-"}</TableCell>
                        <TableCell>
                          {item.product.palletQty ? (
                            formatNumber(item.pallets)
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              defaultValue={item.manualPallets ?? 1}
                              onBlur={(event) =>
                                updateManualPallets(index, Number(event.target.value))
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              item.fillRate < 50 && "text-destructive font-medium",
                              item.fillRate >= 50 &&
                                item.fillRate < 70 &&
                                "font-medium text-amber-600",
                              item.fillRate === 100 && "font-medium text-green-600"
                            )}
                          >
                            {`${formatNumber(item.fillRate)}%`}
                          </span>
                        </TableCell>
                        <TableCell>{`${formatNumber(item.milkrunCost)}원`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-4 text-sm">{`총 팔렛트 ${formatNumber(selectedOrder.totalPallets)}개 × ${selectedOrder.center.name} ${formatNumber(selectedOrder.center.price)}원 = 총 ${formatNumber(selectedOrder.totalCost)}원 (VAT 별도)`}</p>
                {selectedOrder.itemsCalc.some((item) => item.fillRate < 50) && (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> 일부 품목의 마지막 팔렛 충진율이 낮습니다.
                    발주 수량 조정을 검토하세요.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="center-calculator" className="space-y-4">
            <MilkrunCenterCalculator
              defaultPallets={selectedOrder.totalPallets}
              selectedCenterName={selectedOrder.center.name}
            />
          </TabsContent>
        </Tabs>
      )}

      <ManualOrderDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        centers={COUPANG_CENTERS}
        onSave={handleSaveOrder}
      />
      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImportOrders={handleImportOrders}
      />
    </div>
  );
}
