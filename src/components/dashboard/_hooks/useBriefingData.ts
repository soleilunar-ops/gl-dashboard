"use client";

// 메인 대시보드 브리핑 카드용 통합 데이터 훅.
// DB에서 날씨·재고·액션 데이터를 모아 SeasonProfile 형태로 반환한다.
// 대상 날짜: NEXT_PUBLIC_DASHBOARD_DATE 환경변수 (없으면 오늘 KST).

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SeasonProfile } from "@/lib/demo";

const STATION = "파주";
const PRIMARY_KEYWORD = "핫팩";

function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return kst.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekKo(iso: string): string {
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return days[new Date(iso + "T00:00:00Z").getUTCDay()];
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일 ${dayOfWeekKo(iso)}`;
}

function seasonLabelForMonth(month: number): { label: string; meta: string } {
  if ([12, 1, 2].includes(month)) return { label: "핫팩 시즌", meta: "쿠팡 시즌 피크 구간" };
  if ([11].includes(month)) return { label: "핫팩 시즌", meta: "시즌 진입 구간" };
  if ([3, 4, 5].includes(month)) return { label: "비시즌", meta: "쿨링·기능성 중심" };
  return { label: "시즌 준비", meta: "시즌 진입 전" };
}

function describeWeather(precipitation: number | null, temp: number | null): string {
  if ((precipitation ?? 0) > 10) return "비";
  if ((precipitation ?? 0) > 1) return "약한 비";
  if (temp !== null && temp <= 0) return "맑음, 찬 바람";
  if (temp !== null && temp > 15) return "맑음, 포근";
  return "맑음";
}

function distributePrecipitation(
  totalMm: number | null,
  peakHour: number = 15
): Array<{ hour: number; percent: number }> {
  const hours = [6, 9, 12, 15, 18, 21];
  if (!totalMm || totalMm < 0.1) return hours.map((h) => ({ hour: h, percent: 5 + (h % 3) }));
  // totalMm 을 시간대 6칸에 분포 — 피크시간에 최대, 양쪽으로 감쇠
  const base = Math.min(90, Math.max(20, totalMm * 5));
  return hours.map((h) => {
    const dist = Math.abs(h - peakHour) / 9; // 0~1
    const pct = Math.max(10, base * (1 - dist));
    return { hour: h, percent: Math.round(pct) };
  });
}

async function fetchWeather(date: string) {
  const sb = createClient();
  const [todayRes, yesterdayRes, seasonStartRes] = await Promise.all([
    sb
      .from("weather_unified")
      .select("temp_min,temp_max,temp_avg,apparent_temp_avg,precipitation")
      .eq("station", STATION)
      .eq("weather_date", date)
      .maybeSingle(),
    sb
      .from("weather_unified")
      .select("temp_avg")
      .eq("station", STATION)
      .eq("weather_date", addDays(date, -1))
      .maybeSingle(),
    sb
      .from("weather_unified")
      .select("weather_date,temp_min")
      .eq("station", STATION)
      .lte("weather_date", date)
      .gte("weather_date", addDays(date, -120))
      .lt("temp_min", 0)
      .order("weather_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const today = todayRes.data;
  const yesterday = yesterdayRes.data;
  const firstFreeze = seasonStartRes.data;

  const tempC = Number(today?.temp_avg ?? today?.temp_max ?? 0);
  const feelsLikeC = Number(today?.apparent_temp_avg ?? tempC - 2);
  const precipitation = today?.precipitation ? Number(today.precipitation) : null;
  const tempDiff =
    today?.temp_avg && yesterday?.temp_avg
      ? Number(today.temp_avg) - Number(yesterday.temp_avg)
      : 0;

  const description = describeWeather(precipitation, tempC);
  const precip = distributePrecipitation(precipitation);

  const weather: SeasonProfile["weather"] = {
    tempC: Math.round(tempC * 10) / 10,
    feelsLikeC: Math.round(feelsLikeC * 10) / 10,
    description,
    location: STATION,
    latitude: 37.76,
    precipitation: precip,
    triggers: {
      tempDiffFromYesterday: Math.round(tempDiff * 10) / 10,
      firstSubzeroDate: firstFreeze?.weather_date ?? null,
      daysEarlierThanLastYear: 0,
    },
    insight: buildWeatherInsight(tempC, precipitation, tempDiff),
  };
  return weather;
}

function buildWeatherInsight(
  temp: number,
  precipitation: number | null,
  tempDiff: number
): { headline: string; sub: string } {
  if ((precipitation ?? 0) > 10) {
    return {
      headline: `${Math.round(precipitation!)}mm 비 · 재포장 작업 실내 전환`,
      sub: "야외 작업 주의 · 수요 일시 둔화 예상",
    };
  }
  if (temp <= -5) {
    return {
      headline: "한파 피크 구간입니다.",
      sub: "수요 최대 · 야외 재포장 작업 가능",
    };
  }
  if (tempDiff <= -3) {
    return {
      headline: `기온 ${Math.abs(Math.round(tempDiff))}도 급강 — 한파 진입`,
      sub: "검색 급등 예상 · 재고 점검 권장",
    };
  }
  if (temp <= 5) {
    return {
      headline: "본격 시즌 진입 구간",
      sub: "수요 상승 흐름 · 쿠팡 재고 유지 주의",
    };
  }
  return {
    headline: "평온한 기상 흐름",
    sub: "특별한 수요 변동 요인 없음",
  };
}

interface SkuStockRow {
  sku_id: string;
  outbound: number;
  stock: number;
  stockout: boolean;
  latest: string;
}

// SKU detail_category → item_master.category 그룹 매핑 (근사)
const GL_CATEGORY_MAP: Record<string, string[]> = {
  보온소품: ["80g", "30g", "150g", "100g", "발난로"],
  찜질용품: ["냉온찜질팩", "아랫배"],
  "안대/아이마스크": ["아이워머"],
};

async function fetchInventory(date: string) {
  const sb = createClient();
  const from7d = addDays(date, -6);

  const { data: invRows } = await sb
    .from("inventory_operation")
    .select("sku_id,outbound_qty,current_stock,is_stockout,op_date")
    .gte("op_date", from7d)
    .lte("op_date", date);

  const agg = new Map<
    string,
    { outbound: number; stock: number; stockout: boolean; latest: string }
  >();
  for (const r of invRows ?? []) {
    const prev = agg.get(r.sku_id) ?? {
      outbound: 0,
      stock: 0,
      stockout: false,
      latest: "1970-01-01",
    };
    prev.outbound += Number(r.outbound_qty ?? 0);
    if ((r.op_date ?? "") >= prev.latest) {
      prev.stock = Number(r.current_stock ?? 0);
      prev.stockout = !!r.is_stockout;
      prev.latest = r.op_date ?? prev.latest;
    }
    agg.set(r.sku_id, prev);
  }

  // SKU 메타 조회
  const allSkuIds = [...agg.keys()];
  const { data: skuMeta } = await sb
    .from("sku_master")
    .select("sku_id,sku_name,detail_category")
    .in("sku_id", allSkuIds.length > 0 ? allSkuIds : [""]);
  const metaMap = new Map((skuMeta ?? []).map((m) => [m.sku_id, m]));

  // GL(ERP) 카테고리별 재고 합계
  const { data: glByCategory } = await sb
    .from("item_master")
    .select("category,base_stock_qty")
    .eq("is_active", true);
  const glCategorySum = new Map<string, number>();
  for (const row of glByCategory ?? []) {
    const cat = row.category ?? "";
    glCategorySum.set(cat, (glCategorySum.get(cat) ?? 0) + Number(row.base_stock_qty ?? 0));
  }
  const glStockForDetailCategory = (detailCat: string): number => {
    const groups = GL_CATEGORY_MAP[detailCat] ?? [detailCat];
    return groups.reduce((s, g) => s + (glCategorySum.get(g) ?? 0), 0);
  };

  const SAFETY_DIVISOR_COUPANG = 2000;
  const SAFETY_DIVISOR_GL = 1_500_000;

  // 모든 SKU를 status로 분류
  const allCandidates = [...agg.entries()].map(([sku_id, v]) => {
    const meta = metaMap.get(sku_id);
    const detailCat = meta?.detail_category ?? "";
    const glStock = glStockForDetailCategory(detailCat);
    const coupangStock = v.stock;
    const glPct = Math.min(100, Math.round((glStock / SAFETY_DIVISOR_GL) * 100));
    const coupangPct = Math.min(100, Math.round((coupangStock / SAFETY_DIVISOR_COUPANG) * 100));
    const status: "여유" | "적정" | "부족" = v.stockout
      ? "부족"
      : coupangPct < 25
        ? "부족"
        : coupangPct < 60
          ? "적정"
          : "여유";
    const shortName = (meta?.sku_name ?? sku_id).slice(0, 24);
    const specMatch = (meta?.sku_name ?? "").match(/(\d+g|\d+매|\d+개입)/);
    return {
      sku_id,
      outbound: v.outbound,
      stockout: v.stockout,
      rawStock: v.stock,
      card: {
        name: shortName,
        spec: specMatch?.[0] ?? "",
        glStock,
        coupangStock,
        glPercent: glPct,
        coupangPercent: coupangPct,
        status,
        approximate: true,
      },
    };
  });

  // 3단계 각 status별 대표 SKU 1건씩 (판매량 높은 것 우선). 없는 status는 건너뛰고 남은 슬롯은 판매량 TOP에서 보충
  const byStatus = new Map<string, typeof allCandidates>();
  for (const c of allCandidates) {
    const arr = byStatus.get(c.card.status) ?? [];
    arr.push(c);
    byStatus.set(c.card.status, arr);
  }
  const pick = (s: "부족" | "적정" | "여유") =>
    (byStatus.get(s) ?? []).sort((a, b) => b.outbound - a.outbound)[0];
  const picks: typeof allCandidates = [];
  for (const s of ["부족", "적정", "여유"] as const) {
    const p = pick(s);
    if (p) picks.push(p);
  }
  if (picks.length < 3) {
    const pickedIds = new Set(picks.map((p) => p.sku_id));
    const fillers = allCandidates
      .filter((c) => !pickedIds.has(c.sku_id))
      .sort((a, b) => b.outbound - a.outbound);
    while (picks.length < 3 && fillers.length > 0) {
      picks.push(fillers.shift()!);
    }
  }

  const top = picks.map((p) => ({
    sku_id: p.sku_id,
    outbound: p.outbound,
    stock: p.rawStock,
    stockout: p.stockout,
    latest: "",
  }));
  const top3 = picks.map((p) => p.card);

  // 이동 중 PO (가장 가까운 ETA · 도착 전)
  const { data: inTransitRows } = await sb
    .from("import_leadtime")
    .select(
      "po_number,bl_number,product_name,step1_actual,step4_expected,step4_actual,current_step"
    )
    .gte("step4_expected", date)
    .is("step4_actual", null)
    .order("step4_expected", { ascending: true })
    .limit(1);

  const nearest = inTransitRows?.[0];
  const inTransit = nearest
    ? {
        contractNumber: nearest.po_number,
        from: "상해",
        departureDate: nearest.step1_actual ?? "",
        pajuEta: nearest.step4_expected ?? "",
        quantity: parseQuantityFromName(nearest.product_name) ?? 5000,
        currentStep: (nearest.current_step ?? 1) as 1 | 2 | 3,
      }
    : null;

  // 오늘 도착 BL
  const { data: arrivingRows } = await sb
    .from("import_leadtime")
    .select("po_number,bl_number,product_name")
    .eq("step4_expected", date);

  const arrivingToday =
    arrivingRows && arrivingRows.length > 0
      ? {
          blNumber: arrivingRows[0].bl_number ?? "",
          totalQuantity: arrivingRows.reduce(
            (s, r) => s + (parseQuantityFromName(r.product_name) ?? 0),
            0
          ),
          items: arrivingRows.map((r) => ({
            name: r.product_name ?? "",
            quantity: parseQuantityFromName(r.product_name) ?? 0,
          })),
        }
      : null;

  const insight = buildInventoryInsight(top3, arrivingToday);

  const inventory: SeasonProfile["inventory"] = {
    top3,
    inTransit,
    arrivingToday,
    insight,
  };
  return { inventory, stockRows: top as SkuStockRow[], meta: metaMap };
}

function parseQuantityFromName(name: string | null): number | null {
  if (!name) return null;
  const m = name.match(/(\d[\d,]*)\s*박스/);
  if (m) return parseInt(m[1].replace(/,/g, ""), 10) * 10;
  const m2 = name.match(/(\d[\d,]*)\s*개/);
  if (m2) return parseInt(m2[1].replace(/,/g, ""), 10);
  return null;
}

function buildInventoryInsight(
  top3: SeasonProfile["inventory"]["top3"],
  arrivingToday: SeasonProfile["inventory"]["arrivingToday"]
): { headline: string; sub: string } {
  const critical = top3.find((t) => t.status === "부족");
  if (critical) {
    return {
      headline: `${critical.name} 쿠팡 재고 ${critical.coupangStock.toLocaleString()}개 잔여.`,
      sub: "3일 내 품절 예상 · 즉시 보충 권장",
    };
  }
  if (arrivingToday) {
    return {
      headline: `오늘 파주 입고 ${arrivingToday.totalQuantity.toLocaleString()}개 예정`,
      sub: "재포장 후 쿠팡 밀크런 가능 — 인력 배치 확인",
    };
  }
  return {
    headline: "재고 흐름 안정적",
    sub: "안전재고 이상 유지 · 특별 조치 없음",
  };
}

async function fetchAction(
  date: string,
  stockRows: SkuStockRow[],
  skuMeta: Map<string, { sku_id: string; sku_name: string; detail_category: string | null }>
) {
  const sb = createClient();
  const from7d = addDays(date, -6);

  const { data: keywordRows } = await sb
    .from("keyword_trends")
    .select("trend_date,search_index")
    .eq("keyword", PRIMARY_KEYWORD)
    .gte("trend_date", from7d)
    .lte("trend_date", date)
    .order("trend_date", { ascending: true });

  const sparklineValues = (keywordRows ?? []).map((r) => Number(r.search_index ?? 0));
  const lastTwo = sparklineValues.slice(-2);
  const dailyChangePercent =
    lastTwo.length === 2 && lastTwo[0] > 0
      ? Math.round(((lastTwo[1] - lastTwo[0]) / lastTwo[0]) * 100)
      : 0;

  // 자동 태스크 파생
  const tasks: SeasonProfile["action"]["tasks"] = [];

  // 1. 재고 부족 SKU → 긴급
  for (const s of stockRows) {
    if (s.stockout) {
      const name = skuMeta.get(s.sku_id)?.sku_name?.slice(0, 20) ?? s.sku_id;
      tasks.push({
        id: `stockout-${s.sku_id}`,
        title: `쿠팡 ${name} 재고 보충`,
        description: `쿠팡 재고 ${s.stock.toLocaleString()}개 · 안전재고 미달`,
        tag: "긴급",
      });
      if (tasks.length >= 3) break;
    }
  }

  // 2. 도착 예정·지연 PO
  if (tasks.length < 3) {
    const { data: poRows } = await sb
      .from("import_leadtime")
      .select("po_number,product_name,step4_expected,step4_actual")
      .gte("step4_expected", addDays(date, -7))
      .lte("step4_expected", addDays(date, 7))
      .is("step4_actual", null)
      .order("step4_expected", { ascending: true });

    for (const po of poRows ?? []) {
      if (tasks.length >= 3) break;
      if (!po.step4_expected) continue;
      const diff =
        (new Date(po.step4_expected).getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 0) {
        tasks.push({
          id: `delay-${po.po_number}`,
          title: `${po.po_number} 통관 지연 확인`,
          description: `도착 예정 ${Math.abs(Math.floor(diff))}일 경과 · 포워더 연락 필요`,
          tag: "긴급",
        });
      } else if (diff === 0) {
        tasks.push({
          id: `today-${po.po_number}`,
          title: `파주 도착 물류 재포장 작업`,
          description: `${po.product_name?.slice(0, 40) ?? ""} 입고 대기`,
          tag: "오늘",
        });
      } else if (diff <= 7) {
        tasks.push({
          id: `week-${po.po_number}`,
          title: `${po.po_number} 입고 대비`,
          description: `${Math.floor(diff)}일 후 도착 · 창고 공간 확보`,
          tag: "이번주",
        });
      }
    }
  }

  // 3. 예비 — 생산/외주 제안
  if (tasks.length < 3) {
    tasks.push({
      id: "fallback-prod",
      title: "생산 라인 점검",
      description: "시즌 피크 대비 원부자재·가용 라인 확인",
      tag: "이번주",
    });
  }

  const insight: { headline: string; sub: string } =
    dailyChangePercent >= 20
      ? {
          headline: "검색량 최고치 구간.",
          sub: `전일 대비 ${dailyChangePercent}% 급등 · 재고 충당이 핵심`,
        }
      : dailyChangePercent >= 5
        ? { headline: "검색량 상승 흐름", sub: "시즌 수요 확산 · 재고 유지" }
        : dailyChangePercent <= -5
          ? {
              headline: "검색량 하락 흐름",
              sub: "수요 둔화 신호 · 발주 속도 재검토",
            }
          : { headline: "평이한 검색량 흐름", sub: "수요 안정 구간" };

  const action: SeasonProfile["action"] = {
    tasks: tasks.slice(0, 3),
    searchVolume: {
      dailyChangePercent,
      sparkline: sparklineValues.length > 0 ? sparklineValues : [0, 0, 0, 0, 0, 0, 0],
      startDate: from7d,
      endDate: date,
    },
    insight,
  };
  return action;
}

function buildHeader(date: string): SeasonProfile["header"] {
  const month = parseInt(date.slice(5, 7), 10);
  const { label, meta } = seasonLabelForMonth(month);
  return {
    dateISO: date,
    dayLabel: formatDayLabel(date),
    seasonLabel: label,
    metaLine: meta,
  };
}

export function useBriefingData(): {
  profile: SeasonProfile | null;
  loading: boolean;
  error: string | null;
} {
  const [profile, setProfile] = useState<SeasonProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const date = process.env.NEXT_PUBLIC_DASHBOARD_DATE || todayKst();
    let canceled = false;

    (async () => {
      try {
        const weather = await fetchWeather(date);
        const { inventory, stockRows, meta } = await fetchInventory(date);
        const action = await fetchAction(date, stockRows, meta);

        if (canceled) return;
        const header = buildHeader(date);
        setProfile({
          id: "peak",
          label: "시즌 피크",
          activeMonths: [12, 1, 2],
          header,
          weather,
          inventory,
          action,
        });
      } catch (e) {
        if (!canceled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  return { profile, loading, error };
}
