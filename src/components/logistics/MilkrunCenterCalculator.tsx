// 변경 이유: 기존 기능과 분리된 센터별 팔렛/비용 계산기를 하위 탭으로 제공하기 위해 추가했습니다.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COUPANG_CENTERS } from "./constants/coupangCenters";

interface MilkrunCenterCalculatorProps {
  defaultPallets: number;
  selectedCenterName?: string;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("ko-KR");
}

export default function MilkrunCenterCalculator({
  defaultPallets,
  selectedCenterName,
}: MilkrunCenterCalculatorProps) {
  const [pallets, setPallets] = useState<number>(defaultPallets > 0 ? defaultPallets : 1);

  useEffect(() => {
    if (defaultPallets > 0) {
      setPallets(defaultPallets);
    }
  }, [defaultPallets]);

  const calculated = useMemo(() => {
    const safePallets = Math.max(0, pallets);
    const selectedCenter = COUPANG_CENTERS.find((center) => center.name === selectedCenterName);
    const selectedCenterCost = selectedCenter ? selectedCenter.price * safePallets : 0;

    return [...COUPANG_CENTERS]
      .map((center) => ({
        ...center,
        totalCost: center.price * safePallets,
        deltaFromSelected: selectedCenter ? selectedCenterCost - center.price * safePallets : 0,
      }))
      .sort((left, right) => left.totalCost - right.totalCost);
  }, [pallets, selectedCenterName]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">팔렛트 수량</p>
              <Input
                type="number"
                min={0}
                value={pallets}
                className="w-48"
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  setPallets(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
                }}
              />
            </div>
            <p className="text-sm">{`계산식: 팔렛트 수량(${formatNumber(pallets)}) × 센터별 단가`}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>순위</TableHead>
                <TableHead>센터명</TableHead>
                <TableHead>권역</TableHead>
                <TableHead>센터 단가</TableHead>
                <TableHead>팔렛트 수량</TableHead>
                <TableHead>예상 운송비</TableHead>
                <TableHead>현재 선택 센터 대비</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculated.map((center, index) => (
                <TableRow key={center.name}>
                  <TableCell>
                    {index < 3 ? (
                      <Badge variant="secondary">{`${index + 1}순위`}</Badge>
                    ) : (
                      `${index + 1}`
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{center.name}</TableCell>
                  <TableCell>{center.region}</TableCell>
                  <TableCell>{`${formatNumber(center.price)}원`}</TableCell>
                  <TableCell>{`${formatNumber(pallets)}개`}</TableCell>
                  <TableCell>{`${formatNumber(center.totalCost)}원`}</TableCell>
                  <TableCell>
                    {!selectedCenterName ? (
                      "-"
                    ) : center.deltaFromSelected > 0 ? (
                      <span className="font-medium text-green-600">{`-${formatNumber(center.deltaFromSelected)}원 절감`}</span>
                    ) : center.deltaFromSelected < 0 ? (
                      <span className="text-destructive font-medium">{`+${formatNumber(Math.abs(center.deltaFromSelected))}원 증가`}</span>
                    ) : (
                      <span className="text-muted-foreground">동일</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
