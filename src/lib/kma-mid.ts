// 변경 이유: 기상청 중기 육상(getMidLandFcst) + 중기 기온(getMidTa) 병행 조회입니다.
import { addDays, format, parseISO } from "date-fns";
import { kstHour, todayKstYmdDash, ymdDashToCompact } from "@/lib/kma-time";

const MID_LAND_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst";
const MID_TA_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa";

export type KmaMidItem = Record<string, string>;

function tmFcString(now: Date): string {
  const ymdDash = todayKstYmdDash(now);
  const hour = kstHour(now);
  const compact = ymdDashToCompact(ymdDash);
  if (hour >= 6) return `${compact}0600`;
  const prev = format(addDays(parseISO(`${ymdDash}T12:00:00+09:00`), -1), "yyyyMMdd");
  return `${prev}1800`;
}

function midDayIndexFromToday(targetDateYmd: string, now: Date): number {
  const todayDash = todayKstYmdDash(now);
  const t0 = parseISO(`${todayDash}T12:00:00+09:00`).getTime();
  const t1 = parseISO(`${targetDateYmd}T12:00:00+09:00`).getTime();
  return Math.round((t1 - t0) / 86400000);
}

export interface MidAggregate {
  wfText: string;
  popMax: number;
  tmin: number;
  tmax: number;
}

/** 중기육상·중기기온 API 각 1회 호출로 원본 행 확보 */
export async function fetchMidLandTaRows(
  serviceKey: string,
  landRegId: string,
  taRegId: string,
  now: Date = new Date()
): Promise<{ landItem: KmaMidItem | undefined; taItem: KmaMidItem | undefined }> {
  const tmFc = tmFcString(now);
  const landParams = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "10",
    dataType: "JSON",
    regId: landRegId,
    tmFc,
  });
  const taParams = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "10",
    dataType: "JSON",
    regId: taRegId,
    tmFc,
  });

  const [landRes, taRes] = await Promise.all([
    fetch(`${MID_LAND_URL}?${landParams.toString()}`, { cache: "no-store" }),
    fetch(`${MID_TA_URL}?${taParams.toString()}`, { cache: "no-store" }),
  ]);

  if (!landRes.ok) throw new Error(`중기육상 호출 실패(${landRes.status})`);
  if (!taRes.ok) throw new Error(`중기기온 호출 실패(${taRes.status})`);

  const landPayload = (await landRes.json()) as {
    response?: { body?: { items?: { item?: KmaMidItem[] } } };
  };
  const taPayload = (await taRes.json()) as {
    response?: { body?: { items?: { item?: KmaMidItem[] } } };
  };

  return {
    landItem: landPayload.response?.body?.items?.item?.[0],
    taItem: taPayload.response?.body?.items?.item?.[0],
  };
}

/** 오늘로부터 n일째(0=오늘)에 해당하는 중기예보 슬롯(wf3~wf10 등) */
export function midAggregateForOffsetDays(
  landItem: KmaMidItem | undefined,
  taItem: KmaMidItem | undefined,
  offsetDays: number
): MidAggregate {
  if (!landItem) {
    return { wfText: "구름많음", popMax: 0, tmin: 0, tmax: 0 };
  }
  const clamped = Math.min(Math.max(offsetDays, 3), 10);
  const amKey = `rnSt${clamped}Am`;
  const pmKey = `rnSt${clamped}Pm`;
  const wfKey = `wf${clamped}Am`;

  const pop = Math.max(Number(landItem[amKey] ?? 0), Number(landItem[pmKey] ?? 0));
  const wf = landItem[wfKey] ?? "구름많음";

  const taMinKey = `taMin${clamped}`;
  const taMaxKey = `taMax${clamped}`;
  const tmin = taItem ? Number(taItem[taMinKey] ?? 0) : 0;
  const tmax = taItem ? Number(taItem[taMaxKey] ?? 0) : 0;

  return {
    wfText: wf || "구름많음",
    popMax: Number.isFinite(pop) ? pop : 0,
    tmin: Number.isFinite(tmin) ? tmin : 0,
    tmax: Number.isFinite(tmax) ? tmax : 0,
  };
}

export async function fetchMidAggregate(
  serviceKey: string,
  targetDateYmd: string,
  landRegId: string,
  taRegId: string,
  now: Date = new Date()
): Promise<MidAggregate> {
  const { landItem, taItem } = await fetchMidLandTaRows(serviceKey, landRegId, taRegId, now);
  const diffDays = midDayIndexFromToday(targetDateYmd, now);
  return midAggregateForOffsetDays(landItem, taItem, diffDays);
}
