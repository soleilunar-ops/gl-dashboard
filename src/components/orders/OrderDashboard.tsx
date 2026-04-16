"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import OrderTable from "./OrderTable";
import BatchProfitSidebar from "./BatchProfitSidebar";
import { useExchangeRate } from "./_hooks/useExchangeRate";
import { calcMargin, type ChannelKey } from "@/lib/margin/useMarginCalc";

interface OrderBatch {
  id: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyShipped: number;
  qtyTotal: number;
  eta: string;
  status: "대기" | "선적중" | "통관" | "입고완료" | "출고대기";
  center: string;
  cnyCost: number;
  exPI: number;
  rework: number;
  pcsPerPallet: number;
  channel: ChannelKey;
}

const MOCK_ORDERS: OrderBatch[] = [
  {
    id: "PO-2026-041",
    sku: "GL-HAR-10",
    name: "붙이는하루온팩 10매입",
    qtyOrdered: 585600,
    qtyShipped: 292800,
    qtyTotal: 585600,
    eta: "2026-04-22",
    status: "선적중",
    center: "이천1(36)",
    cnyCost: 1.42,
    exPI: 193.5,
    rework: 25000,
    pcsPerPallet: 14400,
    channel: "coupang_rocket",
  },
  {
    id: "PO-2026-038",
    sku: "GL-HAR-40",
    name: "붙이는하루온팩 40매입",
    qtyOrdered: 43200,
    qtyShipped: 43200,
    qtyTotal: 43200,
    eta: "2026-04-18",
    status: "출고대기",
    center: "안성4(14)",
    cnyCost: 5.2,
    exPI: 191,
    rework: 25000,
    pcsPerPallet: 14400,
    channel: "coupang_rocket",
  },
  {
    id: "PO-2026-035",
    sku: "GL-MINI-30",
    name: "하루온미니 붙이는 30매입",
    qtyOrdered: 76800,
    qtyShipped: 76800,
    qtyTotal: 76800,
    eta: "2026-04-16",
    status: "통관",
    center: "이천2(05)",
    cnyCost: 3.85,
    exPI: 190.2,
    rework: 25000,
    pcsPerPallet: 19200,
    channel: "coupang_rocket",
  },
];

export default function OrderDashboard() {
  const [batches] = useState<OrderBatch[]>(MOCK_ORDERS);
  const { exCurrent, setExCurrent, usdKrwRate, rateStatus, isRateLoading, fetchExchangeRate } =
    useExchangeRate();
  const [shipmentInputMap, setShipmentInputMap] = useState<Record<string, number>>(
    MOCK_ORDERS.reduce<Record<string, number>>((acc, batch) => {
      acc[batch.id] = batch.qtyShipped;
      return acc;
    }, {})
  );
  const [uploadMessage, setUploadMessage] = useState("CSV 업로드 대기 중");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const profitabilityRows = useMemo(
    () =>
      batches.map((batch) => {
        const shipmentQty = shipmentInputMap[batch.id] ?? 0;
        const result = calcMargin({
          cnyCostPerUnit: batch.cnyCost,
          exPI: batch.exPI,
          exCurrent,
          qShip: shipmentQty,
          qTotal: batch.qtyTotal,
          palletReworkCost: batch.rework,
          centerName: batch.center,
          pcsPerPallet: batch.pcsPerPallet,
          targetMargin: 0.15,
          channel: batch.channel,
        });

        return {
          ...batch,
          shipmentQty,
          exFinal: result.exFinal,
          totalUnitCost: result.totalCostPerUnit,
          expectedRevenue: result.suggestedPriceVAT * shipmentQty,
          expectedProfit: result.profitPerUnit * shipmentQty,
          marginRate: result.actualMargin,
        };
      }),
    [batches, exCurrent, shipmentInputMap]
  );

  const totalExpectedRevenue = useMemo(
    () => profitabilityRows.reduce((sum, row) => sum + row.expectedRevenue, 0),
    [profitabilityRows]
  );

  const handleCsvUpload = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const uploadedRows = lines.length > 1 ? lines.length - 1 : 0;
    setUploadMessage(`CSV 업로드 완료: ${uploadedRows.toLocaleString()}개 행 감지`);
  };

  const handleShipmentChange = (id: string, qty: number) => {
    setShipmentInputMap((prev) => ({ ...prev, [id]: qty }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Claude ORDERS 대시보드 기준 Mock 데이터가 적용되며, 출고 예정 수량 입력 시 기대 수익이
          즉시 반영됩니다.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-28"
            step="0.1"
            value={exCurrent}
            onChange={(event) => {
              const value = Number(event.target.value);
              setExCurrent(Number.isFinite(value) ? value : 0);
            }}
          />
          <Badge variant="outline" className="font-mono">
            USD/KRW {usdKrwRate > 0 ? usdKrwRate.toFixed(2) : "-"}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void fetchExchangeRate();
            }}
            disabled={isRateLoading}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isRateLoading ? "animate-spin" : ""}`} />
            환율 조회
          </Button>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              await handleCsvUpload(file);
              event.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="mr-1 h-4 w-4" /> CSV 업로드 (CSV Dropzone)
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{rateStatus}</p>
      <p className="text-muted-foreground text-xs">{uploadMessage}</p>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>실시간 출고 대기 테이블</CardTitle>
            <CardDescription>
              Net 정산액(56%) 기반 순마진 계산 후 최종 수익을 집계합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            <OrderTable rows={profitabilityRows} onShipmentChange={handleShipmentChange} />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle>배치별 기대 수익</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-3">
            <BatchProfitSidebar
              rows={profitabilityRows}
              totalExpectedRevenue={totalExpectedRevenue}
              exCurrent={exCurrent}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
