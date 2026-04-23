"use client";

// 쿠팡 Supply Hub 엑셀 업로드 대시보드.
// 5가지 카테고리 업로드 슬롯 + 업로드/다운로드 이력 표.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadSlot, type UploadCategory } from "./UploadSlot";
import { UploadHistory } from "./UploadHistory";

const CATEGORIES: UploadCategory[] = [
  {
    key: "basic_operation_rocket",
    label: "기본 물류지표 (Rocket)",
    description: "basic_operation_rocket_YYYYMMDD.csv — 쿠팡 로켓 기본 운영 지표",
    accept: "csv",
    targetTable: "bi_box_daily",
    exampleFile: "basic_operation_rocket_20260101~20260331.csv",
  },
  {
    key: "daily_performance",
    label: "일간 종합 성과지표",
    description: "daily_performance_YYYYMMDD.csv — SKU별 일간 GMV·판매수량·전환율",
    accept: "csv",
    targetTable: "daily_performance",
    exampleFile: "daily_performance_20260101~20260331.csv",
  },
  {
    key: "fill_rate",
    label: "납품률 (주별)",
    description: "FillRate-{공급사}-{YYYY}-{WW}.xlsx — 주차별 납품률",
    accept: "xlsx",
    targetTable: "noncompliant_delivery",
    exampleFile: "FillRate-A00049331-2026-10.xlsx",
  },
  {
    key: "noncompliant_delivery",
    label: "입고기준 미준수 (주별)",
    description: "NonCompliantDelivery-{공급사}-{YYYY}-{WW}.xlsx — 주차별 미준수 집계",
    accept: "xlsx",
    targetTable: "noncompliant_delivery",
    exampleFile: "NonCompliantDelivery-A00049331-2026-10.xlsx",
  },
  {
    key: "regional_sales",
    label: "지역별 판매 트렌드",
    description: "지역별 월간 판매 데이터 — 시도·시군구별 카테고리 매출",
    accept: "xlsx",
    targetTable: "regional_sales",
    exampleFile: "regional_sales_2026_monthly.xlsx",
  },
];

export default function UploadDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">엑셀 업로드</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          쿠팡 Supply Hub에서 추출한 5종 데이터를 업로드합니다. 과거 업로드·출력 이력도 이 화면에서
          확인할 수 있습니다.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <UploadSlot key={cat.key} category={cat} onUploaded={bumpRefresh} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">업로드 · 출력 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadHistory refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}
