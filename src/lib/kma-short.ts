// 변경 이유: 기상청 단기예보(getVilageFcst) 호출 및 일별 집계(파주 격자)입니다.
import { addDays, format, parseISO } from "date-fns";
import { parsePcpMillimeters } from "@/lib/kma-pcp-parse";
import { kstHour, todayKstYmdDash, ymdDashToCompact } from "@/lib/kma-time";

const SHORT_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

export type KmaVilageItem = Record<string, string>;

function getBaseTimeForKstHour(hour: number): string {
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

function vilageBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const ymdDash = todayKstYmdDash(now);
  const hour = kstHour(now);
  if (hour < 3) {
    const prev = addDays(parseISO(`${ymdDash}T12:00:00+09:00`), -1);
    return { baseDate: format(prev, "yyyyMMdd"), baseTime: "2300" };
  }
  return { baseDate: ymdDashToCompact(ymdDash), baseTime: getBaseTimeForKstHour(hour) };
}

export interface ShortAggregate {
  tmin: number;
  tmax: number;
  skyCode: 1 | 3 | 4;
  ptyCode: 0 | 1 | 2 | 3 | 4;
  popMax: number;
  pcpSum: number;
  wsdMax: number;
  rehAvg: number;
}

/** 단기 격자 API 1회 호출 결과(여러 일자 fcstDate 포함). */
export async function fetchVilageForecastItems(
  serviceKey: string,
  nx: number,
  ny: number,
  now: Date = new Date()
): Promise<KmaVilageItem[]> {
  const { baseDate, baseTime } = vilageBaseDateTime(now);
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });

  const response = await fetch(`${SHORT_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`단기예보 호출 실패(${response.status})`);
  }

  const payload = (await response.json()) as {
    response?: { body?: { items?: { item?: KmaVilageItem[] } } };
  };
  return payload.response?.body?.items?.item ?? [];
}

/** 단기 응답에서 특정 일자(y-m-d)만 모아 ShortAggregate 계산 */
export function aggregateShortDayFromItems(
  items: KmaVilageItem[],
  targetDateYmd: string
): ShortAggregate {
  const targetCompact = ymdDashToCompact(targetDateYmd);
  const dayItems = items.filter((item) => item.fcstDate === targetCompact);
  if (dayItems.length === 0) {
    return {
      tmin: 0,
      tmax: 0,
      skyCode: 1,
      ptyCode: 0,
      popMax: 0,
      pcpSum: 0,
      wsdMax: 0,
      rehAvg: 0,
    };
  }

  const tmpVals: number[] = [];
  const tmnVals: number[] = [];
  const tmxVals: number[] = [];
  const popVals: number[] = [];
  const ptyVals: number[] = [];
  const skyVals: number[] = [];
  const pcpVals: number[] = [];
  const wsdVals: number[] = [];
  const rehVals: number[] = [];

  for (const item of dayItems) {
    const cat = item.category;
    const val = item.fcstValue;
    if (cat === "TMP") {
      const n = Number(val);
      if (Number.isFinite(n)) tmpVals.push(n);
    }
    if (cat === "TMN") {
      const n = Number(val);
      if (Number.isFinite(n)) tmnVals.push(n);
    }
    if (cat === "TMX") {
      const n = Number(val);
      if (Number.isFinite(n)) tmxVals.push(n);
    }
    if (cat === "POP") {
      const n = Number(val);
      if (Number.isFinite(n)) popVals.push(n);
    }
    if (cat === "PTY") {
      const n = Number(val);
      if (Number.isFinite(n)) ptyVals.push(n);
    }
    if (cat === "SKY") {
      const n = Number(val);
      if (Number.isFinite(n)) skyVals.push(n);
    }
    if (cat === "PCP") {
      pcpVals.push(parsePcpMillimeters(String(val)));
    }
    if (cat === "WSD") {
      const n = Number(val);
      if (Number.isFinite(n)) wsdVals.push(n);
    }
    if (cat === "REH") {
      const n = Number(val);
      if (Number.isFinite(n)) rehVals.push(n);
    }
  }

  const tminFromBands =
    tmnVals.length > 0 ? Math.min(...tmnVals) : tmpVals.length > 0 ? Math.min(...tmpVals) : 0;
  const tmaxFromBands =
    tmxVals.length > 0 ? Math.max(...tmxVals) : tmpVals.length > 0 ? Math.max(...tmpVals) : 0;
  const skyRounded =
    skyVals.length > 0 ? Math.round(skyVals.reduce((a, b) => a + b, 0) / skyVals.length) : 1;
  const skyCode = (skyRounded >= 4 ? 4 : skyRounded >= 3 ? 3 : 1) as 1 | 3 | 4;
  const ptyCode = (ptyVals.length > 0 ? Math.max(...ptyVals) : 0) as 0 | 1 | 2 | 3 | 4;

  return {
    tmin: Math.round(tminFromBands * 10) / 10,
    tmax: Math.round(tmaxFromBands * 10) / 10,
    skyCode,
    ptyCode,
    popMax: popVals.length > 0 ? Math.max(...popVals) : 0,
    pcpSum: Math.round(pcpVals.reduce((a, b) => a + b, 0) * 10) / 10,
    wsdMax: wsdVals.length > 0 ? Math.round(Math.max(...wsdVals) * 10) / 10 : 0,
    rehAvg:
      rehVals.length > 0
        ? Math.round((rehVals.reduce((a, b) => a + b, 0) / rehVals.length) * 10) / 10
        : 0,
  };
}

export async function fetchShortAggregate(
  serviceKey: string,
  targetDateYmd: string,
  nx: number,
  ny: number,
  now: Date = new Date()
): Promise<ShortAggregate> {
  const items = await fetchVilageForecastItems(serviceKey, nx, ny, now);
  return aggregateShortDayFromItems(items, targetDateYmd);
}
