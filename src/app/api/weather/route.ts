// 변경 이유: 재작업일 날씨를 프론트에서 공통 포맷으로 안전하게 사용하기 위해 서버 프록시 라우트를 추가했습니다.
import { NextResponse } from "next/server";

const SHORT_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const MID_LAND_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst";
const PAJU_NX = 37;
const PAJU_NY = 130;
const MID_REG_ID = "11B20601";

interface WeatherResponse {
  date: string;
  pop: number;
  isRainy: boolean;
  label: string;
  emoji: string;
  source: "단기예보" | "중기예보";
}

interface ShortForecastResult {
  pop: number;
  isRainy: boolean;
  skyCode: number;
}

interface MidForecastResult {
  pop: number;
  isRainy: boolean;
  wfText: string;
}

type KmaItem = Record<string, string>;

function getBaseTime(now: Date): string {
  const hour = now.getHours();
  const times = [2, 5, 8, 11, 14, 17, 20, 23];
  const baseTimes = ["0200", "0500", "0800", "1100", "1400", "1700", "2000", "2300"];

  for (let index = times.length - 1; index >= 0; index -= 1) {
    const target = times[index];
    const base = baseTimes[index];
    if (target !== undefined && base !== undefined && hour >= target + 1) {
      return base;
    }
  }
  return "2300";
}

function normalizeDate(input: string): string | null {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(input)) {
    return null;
  }
  return input;
}

function mapSkyCodeToLabel(skyCode: number): string {
  if (skyCode === 1) return "맑음";
  if (skyCode === 3) return "구름많음";
  if (skyCode === 4) return "흐림";
  return "구름많음";
}

function labelToEmoji(label: string, isRainy: boolean): string {
  if (label.includes("뇌우")) return "⛈️";
  if (label.includes("소나기")) return "🌦️";
  if (label.includes("비")) return "🌧️";
  if (label.includes("눈")) return "❄️";
  if (label.includes("흐림")) return "☁️";
  if (label.includes("구름많음")) return "⛅";
  if (label.includes("맑음")) return "☀️";
  return isRainy ? "🌧️" : "🌤️";
}

async function getShortForecast(
  targetDate: string,
  serviceKey: string
): Promise<ShortForecastResult> {
  const now = new Date();
  const baseDate =
    now.getHours() < 3
      ? new Date(now.getTime() - 86400000).toISOString().slice(0, 10).replace(/-/g, "")
      : now.toISOString().slice(0, 10).replace(/-/g, "");
  const baseTime = getBaseTime(now);

  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(PAJU_NX),
    ny: String(PAJU_NY),
  });

  const response = await fetch(`${SHORT_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`단기예보 호출 실패(${response.status})`);
  }

  const payload = (await response.json()) as {
    response?: { body?: { items?: { item?: KmaItem[] } } };
  };
  const items = payload.response?.body?.items?.item ?? [];
  const target = targetDate.replace(/-/g, "");
  const dayItems = items.filter((item) => item.fcstDate === target);
  if (dayItems.length === 0) {
    return { pop: 0, isRainy: false, skyCode: 1 };
  }

  const popValues = dayItems
    .filter((item) => item.category === "POP")
    .map((item) => Number(item.fcstValue))
    .filter((value) => Number.isFinite(value));
  const maxPOP = popValues.length > 0 ? Math.max(...popValues) : 0;

  const hasPTY = dayItems.some((item) => item.category === "PTY" && Number(item.fcstValue) > 0);
  const skyValues = dayItems
    .filter((item) => item.category === "SKY")
    .map((item) => Number(item.fcstValue))
    .filter((value) => Number.isFinite(value));
  const avgSky =
    skyValues.length > 0 ? skyValues.reduce((sum, value) => sum + value, 0) / skyValues.length : 1;

  return {
    pop: maxPOP,
    isRainy: hasPTY || maxPOP >= 30,
    skyCode: Math.round(avgSky),
  };
}

async function getMidForecast(targetDate: string, serviceKey: string): Promise<MidForecastResult> {
  const now = new Date();
  const hour = now.getHours();
  const tmFcDate = now.toISOString().slice(0, 10).replace(/-/g, "");
  const tmFc = `${tmFcDate}${hour >= 18 ? "1800" : "0600"}`;

  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "10",
    dataType: "JSON",
    regId: MID_REG_ID,
    tmFc,
  });

  const response = await fetch(`${MID_LAND_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`중기예보 호출 실패(${response.status})`);
  }

  const payload = (await response.json()) as {
    response?: { body?: { items?: { item?: KmaItem[] } } };
  };
  const item = payload.response?.body?.items?.item?.[0];
  if (!item) {
    return { pop: 0, isRainy: false, wfText: "구름많음" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${targetDate}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  const amKey = `rnSt${diffDays}Am`;
  const pmKey = `rnSt${diffDays}Pm`;
  const wfKey = `wf${diffDays}Am`;

  const pop = Math.max(Number(item[amKey] ?? 0), Number(item[pmKey] ?? 0));
  const wf = item[wfKey] ?? "";

  return {
    pop,
    isRainy: pop >= 30 || wf.includes("비") || wf.includes("소나기"),
    wfText: wf || "구름많음",
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
  const date = normalizeDate(searchParams.get("date") ?? "");
  if (!date) {
    return NextResponse.json(
      { message: "date 파라미터(YYYY-MM-DD)가 필요합니다." },
      { status: 400 }
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diff < 0) {
    return NextResponse.json({ message: "과거 날짜 (예보 불가)" }, { status: 400 });
  }
  if (diff > 10) {
    return NextResponse.json({ message: "해당 날짜는 아직 예보 범위 외입니다" }, { status: 400 });
  }

  try {
    let result: WeatherResponse;
    if (diff <= 3) {
      const short = await getShortForecast(date, serviceKey);
      const label = short.isRainy ? "비" : mapSkyCodeToLabel(short.skyCode);
      result = {
        date,
        pop: short.pop,
        isRainy: short.isRainy,
        label,
        emoji: labelToEmoji(label, short.isRainy),
        source: "단기예보",
      };
    } else {
      const mid = await getMidForecast(date, serviceKey);
      result = {
        date,
        pop: mid.pop,
        isRainy: mid.isRainy,
        label: mid.wfText,
        emoji: labelToEmoji(mid.wfText, mid.isRainy),
        source: "중기예보",
      };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { message: "날씨 정보를 불러올 수 없습니다. 기상청 사이트를 확인하세요." },
      { status: 502 }
    );
  }
}
