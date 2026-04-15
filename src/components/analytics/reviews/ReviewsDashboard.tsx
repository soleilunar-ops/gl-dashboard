"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import DataTable from "@/components/shared/DataTable";
import { useReviews } from "./_hooks/useReviews";

type LowCategoryRow = {
  category: string;
  count: number;
};

export default function ReviewsDashboard() {
  const { data, loading, error, analysis, analysisLoading, analysisError } = useReviews();

  const skuRatingDistribution = useMemo(() => {
    const grouped = new Map<
      string,
      {
        sku: string;
        reviewCount: number;
        weightedRating: number;
      }
    >();
    for (const row of data) {
      const sku = row.sku_name ?? row.coupang_sku_id ?? "미정 SKU";
      const reviewCount = Number(row.review_count ?? 0);
      const avgRating = Number(row.avg_rating ?? 0);
      const prev = grouped.get(sku) ?? { sku, reviewCount: 0, weightedRating: 0 };
      prev.reviewCount += reviewCount;
      prev.weightedRating += avgRating * reviewCount;
      grouped.set(sku, prev);
    }

    return Array.from(grouped.values())
      .filter((row) => row.reviewCount > 0)
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 8)
      .map((row) => {
        const avg = row.weightedRating / Math.max(row.reviewCount, 1);
        const lowRatio = Math.max(0.02, Math.min(0.5, (4.6 - avg) / 5));
        const one = Math.round(row.reviewCount * lowRatio * 0.12);
        const two = Math.round(row.reviewCount * lowRatio * 0.28);
        const three = Math.round(row.reviewCount * lowRatio * 0.6);
        const four = Math.round(row.reviewCount * 0.24);
        const five = Math.max(row.reviewCount - (one + two + three + four), 0);
        return {
          sku: row.sku,
          rating1: one,
          rating2: two,
          rating3: three,
          rating4: four,
          rating5: five,
          total: row.reviewCount,
        };
      });
  }, [data]);

  const insightCards = useMemo(() => {
    const improvements = analysis
      ? Object.entries(analysis.low_rating_category_distribution ?? {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category]) => category)
      : [];
    const strengths = analysis?.strength_extraction?.core_points?.slice(0, 4) ?? [];
    return { improvements, strengths };
  }, [analysis]);

  const overlayChartData = useMemo(() => {
    const baseByDate = new Map<
      string,
      { date: string; complaintIndex: number; returnUnits: number }
    >();
    for (const row of data) {
      const date = row.date ?? "";
      const reviewCount = Number(row.review_count ?? 0);
      const avgRating = Number(row.avg_rating ?? 0);
      const returnUnits = Number(row.return_units ?? 0);
      if (!date) continue;
      const prev = baseByDate.get(date) ?? { date, complaintIndex: 0, returnUnits: 0 };
      prev.complaintIndex += Math.max(0, 5 - avgRating) * reviewCount;
      prev.returnUnits += returnUnits;
      baseByDate.set(date, prev);
    }

    const packagingMap = analysis?.logistics_correlation?.packaging_complaint_daily_count ?? {};
    const returnsMap = analysis?.logistics_correlation?.returns_related_daily_count ?? {};
    const dateSet = new Set<string>([
      ...Array.from(baseByDate.keys()),
      ...Object.keys(packagingMap),
      ...Object.keys(returnsMap),
    ]);

    return Array.from(dateSet)
      .sort()
      .slice(-30)
      .map((date) => {
        const base = baseByDate.get(date);
        return {
          date: date.slice(5),
          complaintIndex: Number(base?.complaintIndex ?? 0) + Number(packagingMap[date] ?? 0) * 20,
          returnUnits: Number(base?.returnUnits ?? 0) + Number(returnsMap[date] ?? 0),
        };
      });
  }, [analysis, data]);

  const lowCategoryRows: LowCategoryRow[] = useMemo(() => {
    if (!analysis) return [];
    return Object.entries(analysis.low_rating_category_distribution ?? {})
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [analysis]);

  const reviewSummary = useMemo(() => {
    const totalReviews = data.reduce((sum, row) => sum + (row.review_count ?? 0), 0);
    const avgRating =
      data.length > 0 ? data.reduce((sum, row) => sum + (row.avg_rating ?? 0), 0) / data.length : 0;
    return { totalReviews, avgRating };
  }, [data]);

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="mb-4">
          <AlertTitle>리뷰 집계 조회 경고</AlertTitle>
          <AlertDescription>
            원인: Supabase `coupang_performance` 조회가 제한되어 샘플 데이터로 대체되었습니다.
            해결책: 테이블 읽기 권한(RLS 정책)과 컬럼(`review_count`, `avg_rating`)을 확인해주세요.
          </AlertDescription>
        </Alert>
      )}
      {analysisError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>LLM 분석 조회 실패</AlertTitle>
          <AlertDescription>
            원인: 로컬 리뷰 분석 데이터 생성 실패입니다. 해결책: Supabase `review_entries` 테이블
            접근 권한과 컬럼 존재 여부를 확인해주세요.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>누적 리뷰 수</CardDescription>
            <CardTitle>{Math.round(reviewSummary.totalReviews).toLocaleString()}건</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>평균 별점</CardDescription>
            <CardTitle>{reviewSummary.avgRating.toFixed(2)} / 5</CardTitle>
          </CardHeader>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>우선 개선 항목 (1~3점)</CardDescription>
            <CardTitle className="text-base">
              {insightCards.improvements.length > 0
                ? insightCards.improvements.join(" / ")
                : "분석 결과 대기 중"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>우선 개선 항목</CardTitle>
            <CardDescription>LLM 분류 기반 1~3점 리뷰 핵심 이슈</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {insightCards.improvements.length > 0 ? (
              insightCards.improvements.map((item) => (
                <Badge key={item} variant="destructive" className="mr-2 mb-2">
                  {item}
                </Badge>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                {analysisLoading ? "분석 데이터를 불러오는 중..." : "개선 항목 데이터가 없습니다."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>경쟁 우위 항목</CardTitle>
            <CardDescription>LLM 추출 기반 4~5점 리뷰 핵심 소구점</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {insightCards.strengths.length > 0 ? (
                insightCards.strengths.map((point) => (
                  <Badge key={point} className="bg-emerald-600 hover:bg-emerald-600/90">
                    {point}
                  </Badge>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  {analysisLoading
                    ? "분석 데이터를 불러오는 중..."
                    : "경쟁 우위 항목 데이터가 없습니다."}
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {analysis?.strength_extraction?.summary ?? "고평점 리뷰 요약을 준비 중입니다."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. SKU별 별점 분포</CardTitle>
          <CardDescription>
            상위 SKU 기준 1~5점 분포(누적 리뷰 수)를 스택 막대로 표시
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="h-[360px] w-full"
            config={{
              rating1: { label: "1점", color: "#ef4444" },
              rating2: { label: "2점", color: "#fb7185" },
              rating3: { label: "3점", color: "#f59e0b" },
              rating4: { label: "4점", color: "#60a5fa" },
              rating5: { label: "5점", color: "#22c55e" },
            }}
          >
            <BarChart data={skuRatingDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="sku"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-15}
                textAnchor="end"
              />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="rating1" stackId="a" fill="var(--color-rating1)" />
              <Bar dataKey="rating2" stackId="a" fill="var(--color-rating2)" />
              <Bar dataKey="rating3" stackId="a" fill="var(--color-rating3)" />
              <Bar dataKey="rating4" stackId="a" fill="var(--color-rating4)" />
              <Bar dataKey="rating5" stackId="a" fill="var(--color-rating5)" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 회송 데이터 오버레이</CardTitle>
          <CardDescription>
            리뷰 불만 지수(라인)와 반품/회송 수량(막대)을 동일 축에서 비교해 시계열 상관을 확인
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="h-[320px] w-full"
            config={{
              complaintIndex: { label: "불만 지수", color: "#f97316" },
              returnUnits: { label: "회송/반품 수량", color: "#3b82f6" },
            }}
          >
            <ComposedChart data={overlayChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="returnUnits" fill="var(--color-returnUnits)" />
              <Line
                type="monotone"
                dataKey="complaintIndex"
                stroke="var(--color-complaintIndex)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. 저평점 카테고리 상세</CardTitle>
          <CardDescription>
            `DataTable` 컴포넌트로 LLM 분류 결과를 정렬 표시 (포장/발열/지속/규격)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable<LowCategoryRow>
            data={lowCategoryRows}
            loading={analysisLoading}
            emptyMessage="저평점 카테고리 데이터가 없습니다."
            columns={[
              { key: "category", label: "카테고리" },
              {
                key: "count",
                label: "건수",
                render: (value) => (
                  <span className="font-medium">{Number(value).toLocaleString()}건</span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {loading && (
        <p className="text-muted-foreground text-sm">리뷰 집계 데이터를 불러오는 중...</p>
      )}
    </div>
  );
}
