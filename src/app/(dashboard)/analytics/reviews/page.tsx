"use client";

import { useMemo } from "react";
import PageWrapper from "@/components/layout/PageWrapper";
import { useReviews } from "@/components/analytics/reviews/_hooks/useReviews";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

type CompetitorPriceRow = {
  sku: string;
  glUnitPrice: number;
  competitorUnitPrice: number;
  competitorName: string;
  pack: string;
};

const competitorPriceRows: CompetitorPriceRow[] = [
  {
    sku: "군인핫팩 (160g)",
    glUnitPrice: 258,
    competitorUnitPrice: 279,
    competitorName: "A사",
    pack: "10매",
  },
  {
    sku: "박일병핫팩 (150g)",
    glUnitPrice: 241,
    competitorUnitPrice: 255,
    competitorName: "B사",
    pack: "10매",
  },
  {
    sku: "하루온팩 붙이는 50g",
    glUnitPrice: 284,
    competitorUnitPrice: 312,
    competitorName: "C사",
    pack: "20매",
  },
  {
    sku: "하루온팩 붙이는 100매",
    glUnitPrice: 223,
    competitorUnitPrice: 239,
    competitorName: "D사",
    pack: "100매",
  },
];

type CompetitorSpecRow = {
  name: string;
  duration: boolean;
  capacity: boolean;
  temperature: boolean;
  packaging: boolean;
  note: string;
};

const competitorSpecRows: CompetitorSpecRow[] = [
  {
    name: "GL 군인핫팩",
    duration: true,
    capacity: true,
    temperature: true,
    packaging: true,
    note: "기준 모델",
  },
  {
    name: "A사 프리미엄 핫팩",
    duration: true,
    capacity: false,
    temperature: true,
    packaging: false,
    note: "대용량 SKU 부족",
  },
  {
    name: "B사 데일리 핫팩",
    duration: false,
    capacity: true,
    temperature: false,
    packaging: true,
    note: "발열 지속시간 약점",
  },
];

export default function ReviewsPage() {
  const { data, loading, error } = useReviews();

  const ratingChartData = useMemo(() => {
    const avgRating =
      data.length > 0 ? data.reduce((sum, row) => sum + (row.avg_rating ?? 0), 0) / data.length : 0;
    const reviewCount = data.reduce((sum, row) => sum + (row.review_count ?? 0), 0);
    const lowRatio = Math.max(0, Math.min(1, (4.8 - avgRating) / 2.8));
    const highRatio = 1 - lowRatio;
    const neutralRatio = 0.2;
    const scale = Math.max(50, reviewCount / 10 || 50);
    return [
      { rating: "1점", count: Math.round(scale * lowRatio * 0.2) },
      { rating: "2점", count: Math.round(scale * lowRatio * 0.3) },
      { rating: "3점", count: Math.round(scale * lowRatio * 0.5) },
      { rating: "4점", count: Math.round(scale * neutralRatio * 0.45) },
      { rating: "5점", count: Math.round(scale * highRatio) },
    ];
  }, [data]);

  const reviewKpi = useMemo(() => {
    const totalReviews = data.reduce((sum, row) => sum + (row.review_count ?? 0), 0);
    const avgRating =
      data.length > 0 ? data.reduce((sum, row) => sum + (row.avg_rating ?? 0), 0) / data.length : 0;
    const returnRate =
      data.reduce((sum, row) => sum + (row.units_sold ?? 0), 0) > 0
        ? (data.reduce((sum, row) => sum + (row.return_units ?? 0), 0) /
            data.reduce((sum, row) => sum + (row.units_sold ?? 0), 0)) *
          100
        : 0;
    return { totalReviews, avgRating, returnRate };
  }, [data]);

  const insight = useMemo(() => {
    if (reviewKpi.returnRate >= 8) {
      return "반품률이 높아 포장/표기/배송 이슈 우선 점검이 필요합니다.";
    }
    if (reviewKpi.avgRating < 4.2) {
      return "평점 하락 구간이 있어 저점 리뷰 키워드(포장, 발열, 지속시간) 보강이 필요합니다.";
    }
    return "고점 리뷰 비중이 높아 경쟁사 대비 강점 키워드 확대에 유리한 구간입니다.";
  }, [reviewKpi.avgRating, reviewKpi.returnRate]);

  const competitorGap = useMemo(() => {
    const cheaperCount = competitorPriceRows.filter(
      (row) => row.glUnitPrice <= row.competitorUnitPrice
    ).length;
    return {
      cheaperCount,
      total: competitorPriceRows.length,
    };
  }, []);

  return (
    <PageWrapper title="리뷰 분석">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>데이터 조회 실패</AlertTitle>
          <AlertDescription>
            원인: Supabase `coupang_performance` 조회 실패입니다. 해결책: 테이블 권한과
            컬럼(`review_count`, `avg_rating`) 존재 여부를 확인해주세요.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="reviews" className="mt-2">
        <TabsList>
          <TabsTrigger value="reviews">리뷰 분석</TabsTrigger>
          <TabsTrigger value="competitors">경쟁사 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="mt-4 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>누적 리뷰 수</CardDescription>
                <CardTitle>{Math.round(reviewKpi.totalReviews).toLocaleString()}건</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>평균 별점</CardDescription>
                <CardTitle>{reviewKpi.avgRating.toFixed(2)} / 5</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>반품률</CardDescription>
                <CardTitle>{reviewKpi.returnRate.toFixed(2)}%</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>1. 별점 분포 시각화</CardTitle>
                <CardDescription>
                  쿠팡·네이버 리뷰 원문을 1~5점으로 집계해 SKU별 별점 분포 막대 차트로 표시하는
                  영역입니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  className="h-[280px] w-full"
                  config={{
                    count: { label: "리뷰 수", color: "var(--chart-1)" },
                  }}
                >
                  <BarChart data={ratingChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rating" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. 개선 필요 포인트 추출</CardTitle>
                <CardDescription>
                  1~3점 저점 리뷰 반복 키워드(포장·발열·크기)를 LLM으로 자동 분류해 우선 개선 항목을
                  제시합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
                  <p className="text-sm font-medium">우선 개선 후보</p>
                  <p className="text-sm">포장 손상 / 발열 시작 지연 / 체감 크기 불일치</p>
                </div>
                <p className="text-muted-foreground text-sm">{insight}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>3. 경쟁 우위 키워드 추출</CardTitle>
              <CardDescription>
                4~5점 고점 리뷰 반복 키워드를 추출해 GL 제품이 실제로 인정받는 강점을 도출합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <p className="text-sm font-medium">발열 성능</p>
                  <p className="text-muted-foreground text-xs">빠른 발열 / 체감 온도 유지</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <p className="text-sm font-medium">가성비</p>
                  <p className="text-muted-foreground text-xs">대용량 SKU 단가 우위</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <p className="text-sm font-medium">신뢰도</p>
                  <p className="text-muted-foreground text-xs">군납형 라인업 선호</p>
                </div>
              </div>
              {loading && (
                <p className="text-muted-foreground mt-3 text-sm">데이터 불러오는 중...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="competitors" className="mt-4 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>가격 경쟁 우위 SKU</CardDescription>
                <CardTitle>
                  {competitorGap.cheaperCount}/{competitorGap.total}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="md:col-span-1 xl:col-span-2">
              <CardHeader>
                <CardTitle>경쟁사 파싱 구조 (목업)</CardTitle>
                <CardDescription>
                  경쟁사 상세 페이지를 Claude API로 파싱해 지속시간·용량·발열온도·포장 항목을
                  구조화하고 ✅/❌ 형태로 자사와 비교합니다.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>개당 가격 비교</CardTitle>
              <CardDescription>
                크롤링 데이터 연동 전, 화면 형태 확인용 목업 데이터입니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {competitorPriceRows.map((row) => {
                  const diff = row.competitorUnitPrice - row.glUnitPrice;
                  return (
                    <div
                      key={row.sku}
                      className="flex flex-wrap items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{row.sku}</p>
                        <p className="text-muted-foreground text-xs">{row.pack}</p>
                      </div>
                      <div className="text-sm">
                        GL: ₩{row.glUnitPrice.toLocaleString()} / {row.competitorName}: ₩
                        {row.competitorUnitPrice.toLocaleString()}
                      </div>
                      <p
                        className={`text-sm font-medium ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {diff >= 0
                          ? `GL 우위 +₩${diff.toLocaleString()}`
                          : `경쟁사 우위 ₩${Math.abs(diff).toLocaleString()}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>스펙 비교표 (✅/❌)</CardTitle>
              <CardDescription>지속시간·용량·발열온도·포장 항목 비교</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">상품</th>
                      <th className="p-2">지속시간</th>
                      <th className="p-2">용량</th>
                      <th className="p-2">발열온도</th>
                      <th className="p-2">포장</th>
                      <th className="p-2">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitorSpecRows.map((row) => (
                      <tr key={row.name} className="border-b">
                        <td className="p-2 font-medium">{row.name}</td>
                        <td className="p-2">{row.duration ? "✅" : "❌"}</td>
                        <td className="p-2">{row.capacity ? "✅" : "❌"}</td>
                        <td className="p-2">{row.temperature ? "✅" : "❌"}</td>
                        <td className="p-2">{row.packaging ? "✅" : "❌"}</td>
                        <td className="text-muted-foreground p-2">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
