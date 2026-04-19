// 변경 이유: 재작업일별 단기(3일 이내)·중기(그 외) 분기를 한 함수로 묶습니다.
import { addDays, format, parseISO } from "date-fns";
import { finalizeDailyWeather, type DailyWeather } from "@/lib/kma-daily-weather";
import { fetchMidLandTaRows, fetchMidAggregate, midAggregateForOffsetDays } from "@/lib/kma-mid";
import {
  aggregateShortDayFromItems,
  fetchShortAggregate,
  fetchVilageForecastItems,
} from "@/lib/kma-short";
import { kstDiffDaysFromToday, todayKstYmdDash } from "@/lib/kma-time";
import { PAJU } from "@/lib/paju";

function wfToSky(wf: string): 1 | 3 | 4 {
  if (wf.includes("맑음")) return 1;
  if (wf.includes("구름")) return 3;
  return 4;
}

function wfToPty(wf: string): 0 | 1 | 2 | 3 | 4 {
  if (wf.includes("소나기")) return 4;
  if (wf.includes("비") && wf.includes("눈")) return 2;
  if (wf.includes("눈")) return 3;
  if (wf.includes("비")) return 1;
  return 0;
}

export type ReworkWeatherErrorCode = "PAST" | "FUTURE_LIMIT" | "FETCH";

/** 파주 격자: 단기(당일~3일)·중기(4~10일) 분기. label은 화면 표기용. */
export async function fetchPajuForecastForDate(
  serviceKey: string,
  targetYmd: string,
  label: string,
  now: Date = new Date()
): Promise<DailyWeather> {
  const diff = kstDiffDaysFromToday(targetYmd, now);
  if (diff < 0) {
    throw new Error("PAST");
  }
  if (diff > 10) {
    throw new Error("FUTURE_LIMIT");
  }

  if (diff <= 3) {
    const s = await fetchShortAggregate(serviceKey, targetYmd, PAJU.nx, PAJU.ny, now);
    return finalizeDailyWeather({
      date: targetYmd,
      label,
      source: "단기예보",
      tmin: s.tmin,
      tmax: s.tmax,
      skyCode: s.skyCode,
      ptyCode: s.ptyCode,
      popMax: s.popMax,
      pcpSum: s.pcpSum,
      wsdMax: s.wsdMax,
      rehAvg: s.rehAvg,
    });
  }

  const m = await fetchMidAggregate(serviceKey, targetYmd, PAJU.midLandRegId, PAJU.midTaRegId, now);
  const sky = wfToSky(m.wfText);
  const pty = wfToPty(m.wfText);
  return finalizeDailyWeather({
    date: targetYmd,
    label,
    source: "중기예보",
    tmin: m.tmin,
    tmax: m.tmax,
    skyCode: sky,
    ptyCode: pty,
    popMax: m.popMax,
  });
}

export async function fetchReworkDayDailyWeather(
  serviceKey: string,
  reworkYmd: string,
  label: "D-2" | "D-1",
  now: Date = new Date()
): Promise<DailyWeather> {
  return fetchPajuForecastForDate(serviceKey, reworkYmd, label, now);
}

/** 파주: 단기 API 1회 + 중기 API 2회로 오늘(KST)부터 10일 후까지(총 11일) 예보. 기상청 한계상 11일이 최대. */
export async function buildPajuForecastRange(
  serviceKey: string,
  now: Date = new Date()
): Promise<Array<{ date: string; offsetDays: number; data: DailyWeather }>> {
  const today = todayKstYmdDash(now);
  const base = parseISO(`${today}T12:00:00+09:00`);

  const [vilageItems, midRows] = await Promise.all([
    fetchVilageForecastItems(serviceKey, PAJU.nx, PAJU.ny, now),
    fetchMidLandTaRows(serviceKey, PAJU.midLandRegId, PAJU.midTaRegId, now),
  ]);
  const { landItem, taItem } = midRows;

  const out: Array<{ date: string; offsetDays: number; data: DailyWeather }> = [];
  for (let i = 0; i <= 10; i++) {
    const ymd = format(addDays(base, i), "yyyy-MM-dd");
    const label = i === 0 ? "오늘" : `D+${i}`;
    if (i <= 3) {
      const s = aggregateShortDayFromItems(vilageItems, ymd);
      out.push({
        date: ymd,
        offsetDays: i,
        data: finalizeDailyWeather({
          date: ymd,
          label,
          source: "단기예보",
          tmin: s.tmin,
          tmax: s.tmax,
          skyCode: s.skyCode,
          ptyCode: s.ptyCode,
          popMax: s.popMax,
          pcpSum: s.pcpSum,
          wsdMax: s.wsdMax,
          rehAvg: s.rehAvg,
        }),
      });
    } else {
      const m = midAggregateForOffsetDays(landItem, taItem, i);
      const sky = wfToSky(m.wfText);
      const pty = wfToPty(m.wfText);
      out.push({
        date: ymd,
        offsetDays: i,
        data: finalizeDailyWeather({
          date: ymd,
          label,
          source: "중기예보",
          tmin: m.tmin,
          tmax: m.tmax,
          skyCode: sky,
          ptyCode: pty,
          popMax: m.popMax,
        }),
      });
    }
  }
  return out;
}
