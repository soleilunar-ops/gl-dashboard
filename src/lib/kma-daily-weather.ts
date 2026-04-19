// 변경 이유: 단기·중기 예보를 화면용 DailyWeather DTO로 통일합니다.
export type WeatherWarningCode = "우천주의" | "강풍주의" | "한파주의" | "폭염주의";

export interface DailyWeather {
  date: string;
  /** 화면용 라벨 (예: D-2, D+3, 오늘) */
  label: string;
  source: "단기예보" | "중기예보";
  tmin: number;
  tmax: number;
  skyCode: 1 | 3 | 4;
  ptyCode: 0 | 1 | 2 | 3 | 4;
  popMax: number;
  pcpSum?: number;
  wsdMax?: number;
  rehAvg?: number;
  warnings: WeatherWarningCode[];
  summaryKo: string;
  emoji: string;
}

function clampSky(value: number): 1 | 3 | 4 {
  if (value <= 1) return 1;
  if (value >= 4) return 4;
  return 3;
}

function clampPty(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (value >= 4) return 4;
  return value as 0 | 1 | 2 | 3 | 4;
}

export function buildSkyPtySummary(
  sky: 1 | 3 | 4,
  pty: 0 | 1 | 2 | 3 | 4
): { ko: string; emoji: string } {
  const skyKo = sky === 1 ? "맑음" : sky === 3 ? "구름많음" : "흐림";
  const ptyKo =
    pty === 0 ? "" : pty === 1 ? "비" : pty === 2 ? "비·눈" : pty === 3 ? "눈" : "소나기";
  const ko = ptyKo ? `${skyKo} · ${ptyKo}` : skyKo;
  let emoji = "🌤️";
  if (pty === 1 || pty === 2) emoji = "🌧️";
  else if (pty === 3) emoji = "❄️";
  else if (pty === 4) emoji = "🌦️";
  else if (sky === 4) emoji = "☁️";
  else if (sky === 3) emoji = "⛅";
  else emoji = "☀️";
  return { ko, emoji };
}

export function buildWarnings(input: {
  pcpSum?: number;
  popMax: number;
  wsdMax?: number;
  tmin: number;
  tmax: number;
}): WeatherWarningCode[] {
  const out: WeatherWarningCode[] = [];
  const rainMm = input.pcpSum ?? 0;
  if (rainMm >= 5 || input.popMax >= 60) out.push("우천주의");
  if ((input.wsdMax ?? 0) >= 10) out.push("강풍주의");
  if (input.tmin <= -5) out.push("한파주의");
  if (input.tmax >= 33) out.push("폭염주의");
  return out;
}

export function finalizeDailyWeather(
  base: Omit<DailyWeather, "warnings" | "summaryKo" | "emoji">
): DailyWeather {
  const sky = clampSky(base.skyCode);
  const pty = clampPty(base.ptyCode);
  const warnings = buildWarnings({
    pcpSum: base.pcpSum,
    popMax: base.popMax,
    wsdMax: base.wsdMax,
    tmin: base.tmin,
    tmax: base.tmax,
  });
  const { ko, emoji } = buildSkyPtySummary(sky, pty);
  return {
    ...base,
    skyCode: sky,
    ptyCode: pty,
    warnings,
    summaryKo: ko,
    emoji,
  };
}
