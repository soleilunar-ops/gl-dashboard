"use client";

import { useEffect, useState } from "react";

export type HaruruState =
  | "해"
  | "구름 많음"
  | "흐림"
  | "비"
  | "눈"
  | "바람"
  | "더움"
  | "추움"
  | "default";

const SEOUL = { lat: 37.5665, lon: 126.978 };
// 기상청 강풍 기준: 풍속 14m/s 이상 또는 순간풍속 20m/s 이상
const WIND_SUSTAINED_MS = 14;
const WIND_GUST_MS = 20;
// 맑음일 때 기온 기준
const HOT_TEMP_C = 30;
const COLD_TEMP_C = 10;

// WMO weather code — 강수(비)
const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
// WMO weather code — 강수(눈)
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

/**
 * 기상청 발표 기준 매핑
 *  우선순위: 강수(비/눈) > 강풍 > 구름양(해/구름 많음/흐림) > 기온(맑음일 때만)
 *  - 해(맑음): 구름양 50% 미만
 *  - 구름 많음: 구름양 60~80%
 *  - 흐림: 구름양 90% 이상
 *  - 더움/추움: 맑음일 때만 기온으로 세분화
 */
function mapWeather(params: {
  code: number;
  windSpeedMs: number;
  windGustMs: number;
  cloudCover: number;
  tempC: number;
}): HaruruState {
  const { code, windSpeedMs, windGustMs, cloudCover, tempC } = params;

  if (RAIN_CODES.includes(code)) return "비";
  if (SNOW_CODES.includes(code)) return "눈";
  if (windSpeedMs >= WIND_SUSTAINED_MS || windGustMs >= WIND_GUST_MS) return "바람";

  if (cloudCover >= 90) return "흐림";
  if (cloudCover >= 60) return "구름 많음";

  // 맑음(구름양 50% 미만) → 기온으로 세분화
  if (tempC >= HOT_TEMP_C) return "더움";
  if (tempC < COLD_TEMP_C) return "추움";
  return "해";
}

function requestLocation(): Promise<{ lat: number; lon: number }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(SEOUL);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(SEOUL),
      { timeout: 5000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

/** 사용자 위치(실패 시 서울) 기준 현재 날씨를 하루루 상태로 반환 */
export function useHaruruWeather() {
  const [state, setState] = useState<HaruruState>("default");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { lat, lon } = await requestLocation();
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover,temperature_2m` +
          `&wind_speed_unit=ms`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`weather ${res.status}`);
        const data = await res.json();
        const current = data?.current ?? {};
        const next = mapWeather({
          code: Number(current.weather_code ?? 0),
          windSpeedMs: Number(current.wind_speed_10m ?? 0),
          windGustMs: Number(current.wind_gusts_10m ?? 0),
          cloudCover: Number(current.cloud_cover ?? 0),
          tempC: Number(current.temperature_2m ?? 20),
        });
        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) setState("default");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, loaded };
}
