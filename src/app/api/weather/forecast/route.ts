// 변경 이유: 파주 격자 단기·중기 API를 배치 호출해 최대 11일 예보를 한 번에 반환합니다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPajuForecastRange } from "@/lib/kma-rework-fetch";
import { PAJU } from "@/lib/paju";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { expires: number; body: unknown } | null = null;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const serviceKey = process.env.KMA_SERVICE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { message: "KMA_SERVICE_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  if (cache && cache.expires > Date.now()) {
    return NextResponse.json(cache.body);
  }

  try {
    const rows = await buildPajuForecastRange(serviceKey);
    const body = {
      locationLabel: `${PAJU.label}시`,
      grid: { nx: PAJU.nx, ny: PAJU.ny },
      /** 기상청 단기(당일~3일차)·중기(4~10일차) 조합 상한 */
      horizonDays: rows.length,
      note: "예보는 발표 시각 기준이며, 단기·중기 전환 구간(약 3~4일차)에서 정밀도가 달라질 수 있습니다.",
      generatedAt: new Date().toISOString(),
      days: rows,
    };
    cache = { expires: Date.now() + CACHE_TTL_MS, body };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ message: "기상 예보를 불러오지 못했습니다." }, { status: 502 });
  }
}
