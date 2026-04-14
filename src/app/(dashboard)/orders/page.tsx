"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calcMargin, type ChannelKey, roundCurrency } from "@/lib/margin/useMarginCalc";

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

const STATUS_VARIANT: Record<
  OrderBatch["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  대기: "outline",
  선적중: "secondary",
  통관: "default",
  입고완료: "default",
  출고대기: "destructive",
};

interface ExchangeRateResponse {
  base: string;
  target: string;
  rate: number;
  fetchedAt: string;
}

export default function OrdersPage() {
  const [batches] = useState<OrderBatch[]>(MOCK_ORDERS);
  const [exCurrent, setExCurrent] = useState(194.8);
  const [usdKrwRate, setUsdKrwRate] = useState(0);
  const [rateStatus, setRateStatus] = useState("환율 API 동기화 대기");
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [shipmentInputMap, setShipmentInputMap] = useState<Record<string, number>>(
    MOCK_ORDERS.reduce<Record<string, number>>((acc, batch) => {
      acc[batch.id] = batch.qtyShipped;
      return acc;
    }, {})
  );
  const [uploadMessage, setUploadMessage] = useState("CSV 업로드 대기 중");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchRate = useCallback(async (base: "CNY" | "USD") => {
    const response = await fetch(`/api/exchange-rate?base=${base}&target=KRW`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json()) as Partial<ExchangeRateResponse> & { message?: string };

    if (!response.ok || typeof payload.rate !== "number") {
      throw new Error(payload.message ?? `${base}/KRW 환율 API 응답 오류`);
    }

    return payload;
  }, []);

  const fetchExchangeRate = useCallback(async () => {
    setIsRateLoading(true);
    try {
      const [cnyPayload, usdPayload] = await Promise.all([fetchRate("CNY"), fetchRate("USD")]);
      setExCurrent(cnyPayload.rate ?? exCurrent);
      setUsdKrwRate(usdPayload.rate ?? 0);

      const cnyTime = cnyPayload.fetchedAt
        ? new Date(cnyPayload.fetchedAt).toLocaleTimeString("ko-KR")
        : "-";
      const usdTime = usdPayload.fetchedAt
        ? new Date(usdPayload.fetchedAt).toLocaleTimeString("ko-KR")
        : "-";
      setRateStatus(`환율 동기화 완료 (CNY ${cnyTime} / USD ${usdTime})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "환율 API 호출 실패";
      setRateStatus(`${message}: 네트워크/키 설정을 확인해주세요.`);
    } finally {
      setIsRateLoading(false);
    }
  }, [exCurrent, fetchRate]);

  useEffect(() => {
    void fetchExchangeRate();
  }, [fetchExchangeRate]);

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

  return (
    <PageWrapper title="주문 현황">
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
              <div className="rounded-md border">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>발주번호</TableHead>
                      <TableHead>제품명</TableHead>
                      <TableHead>발주/선적</TableHead>
                      <TableHead>ETA</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>센터</TableHead>
                      <TableHead>분할 정산 환율</TableHead>
                      <TableHead>개당 총원가</TableHead>
                      <TableHead>출고 예정 수량</TableHead>
                      <TableHead>총 기대 수익</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-muted-foreground text-[10px]">{row.sku}</div>
                        </TableCell>
                        <TableCell>
                          {row.qtyOrdered.toLocaleString()} / {row.qtyShipped.toLocaleString()}
                        </TableCell>
                        <TableCell>{row.eta}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>{row.center}</TableCell>
                        <TableCell>{row.exFinal.toFixed(2)}</TableCell>
                        <TableCell>{roundCurrency(row.totalUnitCost).toLocaleString()}원</TableCell>
                        <TableCell className="w-32">
                          <Input
                            type="number"
                            min={0}
                            value={row.shipmentQty}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              setShipmentInputMap((prev) => ({
                                ...prev,
                                [row.id]: Number.isFinite(next) && next >= 0 ? next : 0,
                              }));
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-semibold">
                            {roundCurrency(row.expectedRevenue).toLocaleString()}원
                          </p>
                          <p
                            className={`text-[10px] ${row.marginRate < 0.02 ? "text-red-500" : "text-muted-foreground"}`}
                          >
                            순익 {roundCurrency(row.expectedProfit).toLocaleString()}원 /{" "}
                            {(row.marginRate * 100).toFixed(2)}%
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader className="pb-0">
              <CardTitle>배치별 기대 수익</CardTitle>
              <CardDescription>
                출고 예정 수량 변경 시 즉시 업데이트 (현재 환율 {exCurrent.toFixed(1)})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-3">
              {profitabilityRows.map((row) => (
                <div key={row.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">{row.id}</p>
                    <Badge variant={row.marginRate < 0.02 ? "destructive" : "default"}>
                      {(row.marginRate * 100).toFixed(2)}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {roundCurrency(row.expectedRevenue).toLocaleString()}원
                  </p>
                </div>
              ))}
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-muted-foreground text-xs">전체 총 기대 수익</p>
                <p className="text-lg font-semibold">
                  {roundCurrency(totalExpectedRevenue).toLocaleString()}원
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
