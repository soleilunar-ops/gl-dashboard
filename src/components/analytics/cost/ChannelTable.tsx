"use client";

import { useMemo, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { calcMargin, type MarginInput } from "./_hooks/useMarginCalc";
import type { ChannelRate } from "./_hooks/useChannelRates";

type Props = {
  rates: ChannelRate[];
  /** channelPayoutRate는 각 채널 값으로 덮어쓰므로 MarginInput 그대로 수용 */
  baseInput: MarginInput;
  /** 채널 수수료 엑셀 업로드 연동 — 변경 이유: 판매 채널 select 옆에서 테이블 헤더로 이동 */
  channelFileName: string | null;
  channelIsCustom: boolean;
  channelError: string | null;
  onUploadChannelFile: (file: File) => void;
  onResetChannels: () => void;
  onDownloadChannelTemplate: () => void;
};

type Row = {
  channel: string;
  feeText: string;
  recommendedPriceVAT: number;
  unitProfit: number;
  actualMargin: number;
  isMarginAlert: boolean;
  isInfeasible: boolean;
};

/** 채널별 마진 테이블 — 변경 이유: 단일 목표 마진 기준 일괄 비교 + 수수료 엑셀 업로드 */
export default function ChannelTable({
  rates,
  baseInput,
  channelFileName,
  channelIsCustom,
  channelError,
  onUploadChannelFile,
  onResetChannels,
  onDownloadChannelTemplate,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rows: Row[] = useMemo(() => {
    return rates
      .map((ch) => {
        const r = calcMargin({ ...baseInput, channelPayoutRate: ch.payoutRate });
        return {
          channel: ch.channelName,
          feeText: ch.feeText ?? `${((1 - ch.payoutRate) * 100).toFixed(1)}%`,
          recommendedPriceVAT: r.recommendedPriceVAT,
          unitProfit: r.recommendedUnitProfit,
          actualMargin: r.recommendedMargin,
          isMarginAlert: r.isMarginAlert,
          isInfeasible: r.isMarginAlert,
        };
      })
      .sort((a, b) => b.recommendedPriceVAT - a.recommendedPriceVAT);
  }, [rates, baseInput]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUploadChannelFile(file);
    e.target.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">채널별 권장가 · 마진</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
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
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              채널별 수수료율 업데이트
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onDownloadChannelTemplate}>
              엑셀 다운로드
            </Button>
          </div>
        </div>
        {channelIsCustom && channelFileName && (
          <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
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
        {channelError && <p className="mt-2 text-xs text-red-600">업로드 실패: {channelError}</p>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            {/* 제목행 — 아주 연한 #F2BE5C 배경 + 검정 텍스트 + 좌측 정렬 (본문과 동일) */}
            <TableRow className="bg-[#F2BE5C]/10 hover:bg-[#F2BE5C]/10">
              <TableHead className="text-foreground text-left font-semibold">채널명</TableHead>
              <TableHead className="text-foreground text-left font-semibold">수수료율</TableHead>
              <TableHead className="text-foreground text-left font-semibold">
                권장가 (VAT 포함)
              </TableHead>
              <TableHead className="text-foreground text-left font-semibold">목표 마진율</TableHead>
              <TableHead className="text-foreground bg-[#F2BE5C]/25 text-left font-bold">
                개당 순익
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.channel} className={row.isMarginAlert ? "bg-red-50" : ""}>
                <TableCell className="text-left font-medium">{row.channel}</TableCell>
                <TableCell className="text-left">{row.feeText}</TableCell>
                <TableCell className="text-left">
                  {row.isInfeasible
                    ? "—"
                    : `${Math.round(row.recommendedPriceVAT).toLocaleString("ko-KR")}원`}
                </TableCell>
                <TableCell className="text-left">
                  {row.isInfeasible ? "달성 불가" : `${(row.actualMargin * 100).toFixed(1)}%`}
                </TableCell>
                <TableCell className="bg-[#F2BE5C]/10 text-left text-[15px] font-bold text-[#8A6A1F]">
                  {row.isInfeasible
                    ? "—"
                    : `${Math.round(row.unitProfit).toLocaleString("ko-KR")}원`}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  채널 데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
