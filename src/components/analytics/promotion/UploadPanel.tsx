"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import AdCostForm from "@/components/analytics/promotion/AdCostForm";
import CouponNameForm from "@/components/analytics/promotion/CouponNameForm";
import PremiumDataForm from "@/components/analytics/promotion/PremiumDataForm";
import UploadSlot from "@/components/analytics/promotion/UploadSlot";
import { useUploadHistory } from "@/components/analytics/promotion/_hooks/useUploadHistory";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { parseCouponContracts } from "@/lib/excel-parsers/parseCouponContracts";
import { parseDailyPerformance } from "@/lib/excel-parsers/parseDailyPerformance";
import { parseDeliveryDetail } from "@/lib/excel-parsers/parseDeliveryDetail";
import { parseMilkrunCosts } from "@/lib/excel-parsers/parseMilkrunCosts";

export default function UploadPanel() {
  const { rows: historyRows, loading: histLoading, refresh } = useUploadHistory(10);
  const [openSeason, setOpenSeason] = useState<string | null>(null);

  const loadSeason = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("season_config")
      .select("season")
      .eq("is_closed", false)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpenSeason(data?.season ?? null);
  }, []);

  useEffect(() => {
    void loadSeason();
  }, [loadSeason]);

  const onAny = () => void refresh();

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">프로모션 데이터 업로드</h1>
        <p className="text-muted-foreground text-sm">
          매주 월요일 업로드를 권장합니다. 파일명 규칙을 맞추면 자동으로 종류가 인식됩니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">현재 시즌</span>
          {openSeason ? (
            <Badge>{openSeason}</Badge>
          ) : (
            <Badge variant="secondary">진행 시즌 없음</Badge>
          )}
        </div>
      </header>

      <div className="space-y-6">
        <UploadSlot
          title="1. 판매 실적 (일별)"
          hubHint="허브 → 판매 분석 → 일별 다운로드 (파일명: daily_performance_*.csv)"
          accent="blue"
          uploadKind="daily_performance"
          accept="csv"
          expectedColumns={["date", "sku_id"]}
          parser={(f) => parseDailyPerformance(f) as Promise<Record<string, unknown>[]>}
          onUploaded={onAny}
        />
        <UploadSlot
          title="2. 납품 실적 (입고/반출)"
          hubHint="허브 → 재고 → Coupang_Stocked_Data_List*.xlsx"
          accent="green"
          uploadKind="delivery_detail"
          accept="xlsx"
          expectedColumns={["delivery_date", "sku_id"]}
          parser={(f) => parseDeliveryDetail(f) as Promise<Record<string, unknown>[]>}
          onUploaded={onAny}
        />
        <UploadSlot
          title="3. 쿠폰 계약·금액"
          hubHint="허브 → 쿠폰 정산 → coupon_*.xls (HTML 저장 형식 포함)"
          accent="yellow"
          uploadKind="coupon"
          accept={["csv", "xlsx"]}
          expectedColumns={["contract_no", "start_date", "end_date"]}
          parser={(f) => parseCouponContracts(f) as Promise<Record<string, unknown>[]>}
          onUploaded={onAny}
        />
        <UploadSlot
          title="4. 밀크런 비용"
          hubHint="파일명: milkrun_sales_YYYY-MM.xls(x) — 마감월·금액 열 권장"
          accent="purple"
          uploadKind="milkrun"
          accept={["csv", "xlsx"]}
          expectedColumns={["year_month", "amount"]}
          parser={(f) => parseMilkrunCosts(f) as Promise<Record<string, unknown>[]>}
          onUploaded={onAny}
        />
        <AdCostForm onSaved={onAny} />
        <PremiumDataForm onSaved={onAny} />
        <CouponNameForm onSaved={onAny} />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">최근 업로드 이력</h2>
        {histLoading ? (
          <p className="text-muted-foreground text-sm">불러오는 중…</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>파일</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>행수</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyRows.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {h.uploaded_at ? new Date(h.uploaded_at).toLocaleString("ko-KR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{h.file_type ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {h.file_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {(h.period_start ?? "—") + " ~ " + (h.period_end ?? "—")}
                    </TableCell>
                    <TableCell className="text-xs">{h.row_count ?? "—"}</TableCell>
                    <TableCell className="text-xs">{h.status ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
