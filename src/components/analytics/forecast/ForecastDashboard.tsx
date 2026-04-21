"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  CalendarRange,
  Sparkles,
  Package,
  Snowflake,
  Boxes,
  Volume2,
  Pause,
  Square,
  Loader2,
} from "lucide-react";
import {
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForecast, type DailySales, type WeeklyPrediction } from "./_hooks/useForecast";
import { useTTSPlayer, TTS_VOICES, type TTSVoice } from "./_hooks/useTTSPlayer";
import { FASTAPI_URL } from "@/lib/constants";

export default function ForecastDashboard() {
  const { dailySales, predictions, loading, error } = useForecast({ limit: 400 });
  const { insight, insightLoading } = useInsight();

  const salesSeries = aggregateDailySales(dailySales);
  const forecastSeries = aggregateWeeklyForecast(predictions);

  const totalUnits = dailySales.reduce((acc, r) => acc + (r.units_sold ?? 0), 0);
  const totalGmv = dailySales.reduce((acc, r) => acc + Number(r.gmv ?? 0), 0);
  const nextWeekTotal = forecastSeries[0]?.predicted ?? null;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">수요 예측 (핫팩 34 SKU)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          쿠팡 일간성과 + Model A(LightGBM) 예측 + Model B(비율) 발주 · AI 인사이트
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>데이터 조회 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* AI 인사이트 카드 */}
      <InsightCard insight={insight} loading={insightLoading} />

      {/* KPI 행 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="누적 판매 수량"
          value={loading ? "—" : totalUnits.toLocaleString()}
          icon={<TrendingUp className="text-muted-foreground h-4 w-4" />}
          hint={`34 SKU 기준, 최근 ${dailySales.length}일`}
        />
        <KpiCard
          title="누적 GMV"
          value={loading ? "—" : `₩${Math.round(totalGmv).toLocaleString()}`}
          icon={<TrendingUp className="text-muted-foreground h-4 w-4" />}
          hint="정가 기준 매출"
        />
        <KpiCard
          title="다음 주 예측 수량"
          value={
            loading ? "—" : nextWeekTotal !== null ? nextWeekTotal.toLocaleString() : "데이터 없음"
          }
          icon={<CalendarRange className="text-muted-foreground h-4 w-4" />}
          hint="Model A LightGBM (horizon=1)"
        />
      </div>

      {/* 판매 + 예측 결합 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>주별 판매 추이 및 예측 (34 SKU 합계)</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : salesSeries.length === 0 && forecastSeries.length === 0 ? (
            <EmptyHint text="데이터가 없습니다. FastAPI 서버 상태를 확인하세요." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={mergeSalesAndForecast(salesSeries, forecastSeries)}
                margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="실제 판매"
                  stroke="#2563eb"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="예측"
                  stroke="#059669"
                  strokeDasharray="5 5"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 겨울 검증 카드 */}
      <WinterAnalysisCard />

      {/* 포장 단위별 판매 분포 */}
      <PackDistributionCard />

      {/* 발주 시뮬레이션 테이블 */}
      <OrderSimulationCard />
    </div>
  );
}

// ────────────────────────────────────────────
// AI 인사이트 카드
// ────────────────────────────────────────────
function InsightCard({ insight, loading }: { insight: string | null; loading: boolean }) {
  const tts = useTTSPlayer();

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-base font-semibold text-blue-900">AI 발주 인사이트</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!insight) {
    return (
      <Card className="border-gray-200 bg-gray-50/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Sparkles className="h-5 w-5 text-gray-400" />
          <CardTitle className="text-base text-gray-500">AI 발주 인사이트</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            FastAPI 서버(localhost:8000) 실행 후 인사이트가 표시됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <CardTitle className="text-base font-semibold text-blue-900">AI 발주 인사이트</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          <TTSControls tts={tts} />
          <Badge variant="secondary" className="text-xs">
            GPT-4o-mini
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed whitespace-pre-line">{insight}</p>
        {tts.error && <p className="text-destructive mt-2 text-xs">음성 재생 오류: {tts.error}</p>}
      </CardContent>
    </Card>
  );
}

function TTSControls({ tts }: { tts: ReturnType<typeof useTTSPlayer> }) {
  const { state, voice, setVoice, play, pause, stop } = tts;

  const voiceSelector = (
    <Select value={voice} onValueChange={(v) => setVoice(v as TTSVoice)}>
      <SelectTrigger size="sm" className="h-8 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TTS_VOICES.map((v) => (
          <SelectItem key={v.value} value={v.value} className="text-xs">
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  let actionButton;
  if (state === "loading") {
    actionButton = (
      <Button size="sm" variant="outline" disabled className="gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        합성 중
      </Button>
    );
  } else if (state === "playing") {
    actionButton = (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={pause} className="gap-1.5">
          <Pause className="h-3.5 w-3.5" />
          일시정지
        </Button>
        <Button size="sm" variant="ghost" onClick={stop} className="px-2">
          <Square className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  } else {
    const label = state === "paused" ? "이어서 재생" : "음성 브리핑";
    actionButton = (
      <Button size="sm" variant="outline" onClick={play} className="gap-1.5">
        <Volume2 className="h-3.5 w-3.5" />
        {label}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {voiceSelector}
      {actionButton}
    </div>
  );
}

// ────────────────────────────────────────────
// 겨울 검증 카드 (실측 vs 예측)
// ────────────────────────────────────────────
type WinterRow = {
  week_start: string;
  actual: number;
  predicted: number;
  abs_error: number;
  error_pct: number;
  bias: string;
};

function WinterAnalysisCard() {
  const [rows, setRows] = useState<WinterRow[]>([]);
  const [winterLoading, setWinterLoading] = useState(true);

  useEffect(() => {
    fetch(`${FASTAPI_URL}/forecast/winter-analysis`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setWinterLoading(false));
  }, []);

  const totalActual = rows.reduce((a, r) => a + r.actual, 0);
  const totalPredicted = rows.reduce((a, r) => a + r.predicted, 0);
  const avgMae =
    rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.abs_error, 0) / rows.length) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Snowflake className="h-5 w-5 text-cyan-600" />
        <CardTitle>겨울 검증 (합성+실 결합 모델)</CardTitle>
        <Badge variant="secondary" className="ml-auto text-xs">
          2025-10 ~ 2026-04
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {winterLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyHint text="FastAPI /forecast/winter-analysis 응답 대기 중" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">실측 합계</p>
                <p className="text-lg font-semibold">{totalActual.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">예측 합계</p>
                <p className="text-lg font-semibold">{totalPredicted.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">주당 평균 MAE</p>
                <p className="text-lg font-semibold">{avgMae.toLocaleString()}</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week_start" fontSize={10} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="actual" name="실제" fill="#2563eb" />
                  <Bar dataKey="predicted" name="예측" fill="#059669" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────
// 포장 단위별 판매 분포 카드 (지엘 납품 포장 전환 대비)
// ────────────────────────────────────────────
type PackRow = {
  category: string;
  pack_size: number;
  units_sold: number;
  pct: number;
};

const CATEGORIES = ["붙이는 핫팩", "손난로", "일반 핫팩", "찜질팩"] as const;

function PackDistributionCard() {
  const [rows, setRows] = useState<PackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("붙이는 핫팩");

  useEffect(() => {
    fetch(`${FASTAPI_URL}/forecast/pack-distribution`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows
    .filter((r) => r.category === selected)
    .sort((a, b) => b.units_sold - a.units_sold);
  const catTotal = filtered.reduce((a, r) => a + r.units_sold, 0);
  const top5Pct = filtered.slice(0, 5).reduce((a, r) => a + r.pct, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Boxes className="h-5 w-5 text-purple-600" />
        <CardTitle>포장 단위별 판매 분포</CardTitle>
        <Badge variant="secondary" className="ml-auto text-xs">
          지엘 납품 포장 전환용
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 카테고리 탭 */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const isActive = cat === selected;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelected(cat)}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                  (isActive
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200")
                }
              >
                {cat}
              </button>
            );
          })}
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : filtered.length === 0 ? (
          <EmptyHint text="해당 카테고리 판매 데이터가 없습니다." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">총 판매량</p>
                <p className="text-lg font-semibold">{catTotal.toLocaleString()}개</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">옵션 개수</p>
                <p className="text-lg font-semibold">{filtered.length}종</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">상위 5개 커버리지</p>
                <p className="text-lg font-semibold">{top5Pct.toFixed(1)}%</p>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filtered.slice(0, 12).map((r) => ({
                    name: `${r.pack_size}개`,
                    units: r.units_sold,
                    pct: r.pct,
                  }))}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(value) => `${Number(value).toLocaleString()}개`} />
                  <Bar dataKey="units" name="판매량" fill="#9333ea" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs font-medium text-gray-500">
                    <th className="pb-2">포장 단위</th>
                    <th className="pb-2 text-right">판매량</th>
                    <th className="pb-2 text-right">비중</th>
                    <th className="pb-2 text-right">누적 비중</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 10).map((r, i, arr) => {
                    const cum = arr.slice(0, i + 1).reduce((a, x) => a + x.pct, 0);
                    return (
                      <tr key={r.pack_size} className="border-b last:border-0">
                        <td className="py-2 font-mono">{r.pack_size}개</td>
                        <td className="py-2 text-right font-semibold">
                          {r.units_sold.toLocaleString()}
                        </td>
                        <td className="py-2 text-right">{r.pct.toFixed(1)}%</td>
                        <td className="py-2 text-right text-gray-500">{cum.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────
// 발주 시뮬레이션 카드 (Model B) — 주차별 아코디언 + 근거 박스
// ────────────────────────────────────────────
type OrderItem = {
  sku: number;
  name: string;
  predicted_order_qty: number;
  sku_ratio: number;
};

type OrderWeek = {
  week_start: string;
  label: string;
  category_total: number;
  model_a_pred_total: number;
  ratio_applied: number;
  reference_mae: {
    overall_sku_week: number | null;
    winter_sku_week: number | null;
    category_weekly_overall: number | null;
    unit_note: string;
  };
  notable_cases: string[];
  items: OrderItem[];
};

function OrderSimulationCard() {
  const [weeks, setWeeks] = useState<OrderWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number>(0); // 이번 주 기본 펼침

  useEffect(() => {
    fetch(`${FASTAPI_URL}/forecast/order-weekly`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setWeeks)
      .catch(() => setWeeks([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Package className="h-5 w-5 text-orange-600" />
        <CardTitle>발주 시뮬레이션 (Model B) — 주차별 권장</CardTitle>
        <Badge variant="secondary" className="ml-auto text-xs">
          권장 발주량 ≤ 50 제외
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-60 w-full" />
        ) : weeks.length === 0 ? (
          <EmptyHint text="FastAPI /forecast/order-weekly 응답 대기 중" />
        ) : (
          weeks.map((w, idx) => {
            const isOpen = idx === openIdx;
            return (
              <div key={w.week_start} className="rounded-md border">
                {/* 헤더 — 클릭 시 펼침/접힘 */}
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        "rounded px-2 py-0.5 text-xs font-semibold " +
                        (idx === 0 ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-700")
                      }
                    >
                      {w.label}
                    </span>
                    <span className="text-sm text-gray-500">{w.week_start}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">카테고리 총 권장</div>
                      <div className="text-lg font-bold">{w.category_total.toLocaleString()}개</div>
                    </div>
                    <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* 근거 박스 + SKU 표 */}
                {isOpen && (
                  <div className="space-y-3 border-t px-4 py-3">
                    {/* 계산 근거 */}
                    <div className="space-y-1 rounded-md bg-blue-50 p-3 text-xs">
                      <div className="font-semibold text-blue-900">계산 근거</div>
                      <div className="text-gray-700">
                        Model A 주간 판매 예측{" "}
                        <span className="font-mono font-semibold">
                          {w.model_a_pred_total.toLocaleString()}개
                        </span>{" "}
                        × 비율{" "}
                        <span className="font-mono font-semibold">
                          {w.ratio_applied.toFixed(3)}
                        </span>{" "}
                        = 카테고리 총 권장{" "}
                        <span className="font-mono font-semibold">
                          {w.category_total.toLocaleString()}개
                        </span>
                      </div>
                      <div className="text-gray-600">
                        비율 = 직전 4주 납품/판매 실측 (ratio_lookback_weeks=4)
                      </div>
                      <div className="text-gray-600">SKU 분배 = 직전 2주 SKU 판매 점유율</div>
                    </div>

                    {/* 이 숫자의 한계 */}
                    <div className="space-y-1 rounded-md bg-amber-50 p-3 text-xs">
                      <div className="font-semibold text-amber-900">이 숫자의 한계</div>
                      <div className="text-gray-700">신뢰구간 제공 못 함 — 이유 3가지:</div>
                      <ol className="ml-4 list-decimal space-y-0.5 text-gray-600">
                        <li>학습 데이터가 1년치뿐 — 분산 추정 불안정</li>
                        <li>
                          발주 권장(Model B) 자체의 정확도를 측정한 실측 없음. 현재 측정값은 Model A
                          판매 예측 오차만임
                        </li>
                        <li>계절별 오차 편차가 커 단일값으로 표현 불가</li>
                      </ol>
                      <div className="pt-1 text-gray-700">
                        참고 수치 (Model A 판매 예측 MAE — 발주 권장과 별개):
                      </div>
                      <div className="ml-4 font-mono text-gray-600">
                        SKU×주 평균 {w.reference_mae.overall_sku_week?.toLocaleString() ?? "-"} ·{" "}
                        겨울(11~1월) {w.reference_mae.winter_sku_week?.toLocaleString() ?? "-"} ·{" "}
                        카테고리 합산 주간{" "}
                        {w.reference_mae.category_weekly_overall?.toLocaleString() ?? "-"}
                      </div>
                      {w.notable_cases.length > 0 && (
                        <>
                          <div className="pt-1 text-gray-700">편차 큰 주차 사례:</div>
                          <ul className="ml-4 space-y-0.5 text-gray-600">
                            {w.notable_cases.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      <div className="pt-1 text-gray-500">
                        재측정 예정: 2027년 이후 (2년치 실데이터 축적 완료 시)
                      </div>
                    </div>

                    {/* SKU 표 */}
                    {w.items.length === 0 ? (
                      <p className="py-2 text-sm text-gray-500">
                        이 주차에는 50개 초과 권장 SKU가 없습니다.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b text-xs font-medium text-gray-500">
                              <th className="pb-2">SKU</th>
                              <th className="pb-2">제품명</th>
                              <th className="pb-2 text-right">권장 발주량</th>
                              <th className="pb-2 text-right">주 내 비중</th>
                            </tr>
                          </thead>
                          <tbody>
                            {w.items.map((r) => (
                              <tr key={r.sku} className="border-b last:border-0">
                                <td className="py-2 font-mono text-xs">{r.sku}</td>
                                <td className="py-2">{r.name}</td>
                                <td className="py-2 text-right font-semibold">
                                  {r.predicted_order_qty.toLocaleString()}
                                </td>
                                <td className="py-2 text-right text-gray-500">
                                  {(r.sku_ratio * 100).toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────
// 인사이트 훅 (FastAPI /forecast/insight)
// ────────────────────────────────────────────
function useInsight() {
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);

  useEffect(() => {
    fetch(`${FASTAPI_URL}/forecast/insight`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInsight(d?.insight ?? null))
      .catch(() => setInsight(null))
      .finally(() => setInsightLoading(false));
  }, []);

  return { insight, insightLoading };
}

// ────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────
function KpiCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      {text}
    </div>
  );
}

function aggregateDailySales(rows: DailySales[]): { week: string; actual: number }[] {
  // 일별 → 주별(월요일 시작) 집계
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.sale_date) continue;
    const d = new Date(r.sale_date);
    const day = d.getDay();
    const monOffset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + monOffset);
    const weekKey = d.toISOString().slice(0, 10);
    map.set(weekKey, (map.get(weekKey) ?? 0) + (r.units_sold ?? 0));
  }
  return Array.from(map.entries())
    .map(([week, actual]) => ({ week, actual }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

function aggregateWeeklyForecast(rows: WeeklyPrediction[]): { week: string; predicted: number }[] {
  return rows
    .map((r) => ({ week: r.week_start.slice(0, 10), predicted: r.predicted_qty ?? 0 }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

function mergeSalesAndForecast(
  sales: { week: string; actual: number }[],
  forecasts: { week: string; predicted: number }[]
): { week: string; actual?: number; predicted?: number }[] {
  const merged = new Map<string, { actual?: number; predicted?: number }>();
  for (const s of sales) merged.set(s.week, { ...merged.get(s.week), actual: s.actual });
  for (const f of forecasts) merged.set(f.week, { ...merged.get(f.week), predicted: f.predicted });
  return Array.from(merged.entries())
    .map(([week, v]) => ({ week, ...v }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}
