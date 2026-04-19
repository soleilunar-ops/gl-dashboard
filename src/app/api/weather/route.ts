// 변경 이유: 출고일(orderDate) 기준 재작업일(D-2/D-1) 단기·중기예보 분기와 기존 단일 date 조회를 모두 지원합니다.
import { NextResponse } from "next/server";
import type { DailyWeather } from "@/lib/kma-daily-weather";
import { fetchReworkDayDailyWeather } from "@/lib/kma-rework-fetch";
import { reworkDatesFromOrderDate } from "@/lib/kma-time";
import { PAJU } from "@/lib/paju";

const CACHE_TTL_MS = 5 * 60 * 1000;
const orderDateCache = new Map<string, { expires: number; body: unknown }>();

function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(input) ? input : null;
}

/** 단일 날짜(`date`) 조회 시 클라이언트용 요약 페이로드 */
function dailyToLegacyPayload(w: DailyWeather) {
  const isRainy = w.ptyCode > 0 || w.popMax >= 30 || w.warnings.includes("우천주의");
  return {
    date: w.date,
    pop: w.popMax,
    isRainy,
    label: w.summaryKo,
    emoji: w.emoji,
    source: w.source,
  };
}

export async function GET(request: Request) {
  const serviceKey = process.env.KMA_SERVICE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { message: "KMA_SERVICE_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const orderDate = normalizeDate(searchParams.get("orderDate"));

  if (orderDate) {
    const cacheKey = orderDate;
    const hit = orderDateCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return NextResponse.json(hit.body);
    }

    const { dMinus2, dMinus1 } = reworkDatesFromOrderDate(orderDate);

    const buildSlot = async (
      reworkYmd: string,
      label: "D-2" | "D-1"
    ): Promise<
      | { label: "D-2" | "D-1"; date: string; ok: true; data: DailyWeather }
      | { label: "D-2" | "D-1"; date: string; ok: false; message: string }
    > => {
      try {
        const data = await fetchReworkDayDailyWeather(serviceKey, reworkYmd, label);
        return { label, date: reworkYmd, ok: true, data };
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "PAST") {
          return {
            label,
            date: reworkYmd,
            ok: false,
            message: "과거 예보는 지원하지 않아요",
          };
        }
        if (code === "FUTURE_LIMIT") {
          return {
            label,
            date: reworkYmd,
            ok: false,
            message: "해당 날짜는 아직 예보 범위 밖이에요",
          };
        }
        return {
          label,
          date: reworkYmd,
          ok: false,
          message: "날씨 정보를 불러올 수 없습니다.",
        };
      }
    };

    try {
      const [slot2, slot1] = await Promise.all([
        buildSlot(dMinus2, "D-2"),
        buildSlot(dMinus1, "D-1"),
      ]);
      const body = {
        orderDate,
        locationLabel: `${PAJU.label}시`,
        days: [slot2, slot1],
      };
      orderDateCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, body });
      return NextResponse.json(body);
    } catch {
      return NextResponse.json({ message: "날씨 정보를 불러올 수 없습니다." }, { status: 502 });
    }
  }

  const date = normalizeDate(searchParams.get("date"));
  if (!date) {
    return NextResponse.json(
      { message: "date 또는 orderDate(YYYY-MM-DD) 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const data = await fetchReworkDayDailyWeather(serviceKey, date, "D-1");
    return NextResponse.json(dailyToLegacyPayload(data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAST") {
      return NextResponse.json({ message: "과거 날짜 (예보 불가)" }, { status: 400 });
    }
    if (code === "FUTURE_LIMIT") {
      return NextResponse.json({ message: "해당 날짜는 아직 예보 범위 외입니다" }, { status: 400 });
    }
    return NextResponse.json(
      { message: "날씨 정보를 불러올 수 없습니다. 기상청 사이트를 확인하세요." },
      { status: 502 }
    );
  }
}
