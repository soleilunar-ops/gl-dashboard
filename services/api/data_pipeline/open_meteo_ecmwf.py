"""
Open-Meteo ECMWF 예보를 openmeteo-requests + requests-cache + retry-requests 로 조회한다.

변경 이유: 미래 날씨 피처를 표준 HTTP 캐시·재시도와 함께 DataFrame 으로 받기 위함
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import openmeteo_requests
import pandas as pd
import requests_cache
from retry_requests import retry

# Open-Meteo 무료 ECMWF 엔드포인트
ECMWF_OPEN_METEO_URL = "https://api.open-meteo.com/v1/ecmwf"

# 수요예측에 자주 쓰는 일별 변수 (필요 시 호출부에서 교체)
DEFAULT_DAILY_VARIABLES: list[str] = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "windspeed_10m_max",
    "snowfall_sum",
]

# 5개 관측소 좌표 (ASOS STATIONS 와 동일 권역)
STATION_COORDS: dict[str, tuple[float, float]] = {
    "seoul": (37.5665, 126.9780),
    "suwon": (37.25746, 126.983),
    "busan": (35.1796, 129.0756),
    "daejeon": (36.3504, 127.3845),
    "gwangju": (35.1595, 126.8526),
}


@dataclass
class OpenMeteoEcmwfConfig:
    """ECMWF 일별 예보 조회 설정."""

    latitude: float
    longitude: float
    timezone: str = "Asia/Seoul"
    forecast_days: int = 16
    daily_variables: tuple[str, ...] | None = None
    cache_dir: str = ".cache"
    cache_expire_sec: int = 3600


def _make_open_meteo_client(cache_dir: str, cache_expire_sec: int) -> openmeteo_requests.Client:
    cache_session = requests_cache.CachedSession(cache_dir, expire_after=cache_expire_sec)
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    return openmeteo_requests.Client(session=retry_session)


def _daily_response_to_dataframe(
    daily: Any,
    *,
    timezone: str,
    variable_names: list[str],
) -> pd.DataFrame:
    """openmeteo_sdk Daily 블록을 행 단위 DataFrame 으로 변환한다."""
    if daily.VariablesLength() == 0:
        return pd.DataFrame()

    n = len(daily.Variables(0).ValuesAsNumpy())
    t0 = int(daily.Time())
    step = int(daily.Interval())
    times_unix = np.array([t0 + i * step for i in range(n)], dtype=np.int64)

    idx = pd.to_datetime(times_unix, unit="s", utc=True).tz_convert(timezone).normalize()
    out = pd.DataFrame({"date": idx})

    for i, name in enumerate(variable_names):
        vals = daily.Variables(i).ValuesAsNumpy()
        out[name] = vals

    return out


def fetch_ecmwf_daily_forecast(
    cfg: OpenMeteoEcmwfConfig,
) -> pd.DataFrame:
    """
    ECMWF 기반 일별 예보를 DataFrame 으로 반환한다.

    Returns:
        컬럼: date, 이후 Open-Meteo daily 변수명 그대로
    """
    daily_vars = list(cfg.daily_variables) if cfg.daily_variables else list(DEFAULT_DAILY_VARIABLES)
    params: dict[str, Any] = {
        "latitude": cfg.latitude,
        "longitude": cfg.longitude,
        "daily": daily_vars,
        "timezone": cfg.timezone,
        "forecast_days": cfg.forecast_days,
    }

    client = _make_open_meteo_client(cfg.cache_dir, cfg.cache_expire_sec)
    responses = client.weather_api(ECMWF_OPEN_METEO_URL, params=params)
    response = responses[0]
    daily = response.Daily()

    return _daily_response_to_dataframe(daily, timezone=cfg.timezone, variable_names=daily_vars)


def map_to_internal_feature_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    weekly_feature_table 등과 맞추기 위한 권장 컬럼명 매핑 (예측용 미래 피처).

    - 강수: mm 단위 그대로 precipitation_sum -> rain_mm
    - 풍속: windspeed_10m_max -> wind_max_10m (일 최대 풍속)
    - 기온: 최고/최저 -> temp_max, temp_min (mean 은 호출 후 (max+min)/2 등으로 생성)
    - 적설: snowfall_sum -> snow_cm
    """
    rename = {
        "temperature_2m_max": "temp_max",
        "temperature_2m_min": "temp_min",
        "precipitation_sum": "rain_mm",
        "windspeed_10m_max": "wind_max_10m",
        "snowfall_sum": "snow_cm",
    }
    out = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    if "temp_max" in out.columns and "temp_min" in out.columns:
        out["temp_mean"] = (out["temp_max"] + out["temp_min"]) / 2.0
    return out


def fetch_ecmwf_multi_station_forecast(
    forecast_days: int = 16,
    stations: dict[str, tuple[float, float]] | None = None,
    cache_dir: str = ".cache",
    cache_expire_sec: int = 3600,
) -> pd.DataFrame:
    """
    5개 관측소(또는 지정 관측소)의 일별 ECMWF 예보를 수집해 하나의 DataFrame 으로 반환.

    출력 컬럼: date, region, temp_min, temp_max, temp_mean, rain_mm, wind_max_10m, snow_cm, source
    """
    target = stations or STATION_COORDS
    collected: list[pd.DataFrame] = []
    errors: list[str] = []

    for region, (lat, lon) in target.items():
        cfg = OpenMeteoEcmwfConfig(
            latitude=lat,
            longitude=lon,
            forecast_days=forecast_days,
            cache_dir=cache_dir,
            cache_expire_sec=cache_expire_sec,
        )
        try:
            raw = fetch_ecmwf_daily_forecast(cfg)
            mapped = map_to_internal_feature_names(raw)
            mapped["region"] = region
            collected.append(mapped)
        except (RuntimeError, ValueError, OSError) as exc:
            errors.append(f"{region}: {exc}")

    if not collected:
        joined = " | ".join(errors) if errors else "알 수 없는 이유"
        raise RuntimeError(f"모든 관측소 수집 실패: {joined}")

    merged = pd.concat(collected, ignore_index=True)
    merged = _add_forecast_cold_wave_flag(merged)
    merged["source"] = "ecmwf_open_meteo"

    if errors:
        print("[WARN] 일부 관측소 수집 실패:", " | ".join(errors))
    return merged.sort_values(["date", "region"]).reset_index(drop=True)


def _add_forecast_cold_wave_flag(df: pd.DataFrame) -> pd.DataFrame:
    """
    예보 기반 한파 플래그 (ASOS 와 동일 기준):
    - temp_min <= -12℃, 또는
    - (전일 temp_min - 당일 temp_min) >= 10 AND temp_min <= 3℃
    """
    out = df.sort_values(["region", "date"]).copy()
    prev_min = out.groupby("region")["temp_min"].shift(1)
    drop = prev_min - out["temp_min"]
    cond_abs = (out["temp_min"] <= -12).fillna(False)
    cond_rel = ((drop >= 10) & (out["temp_min"] <= 3)).fillna(False)
    out["cold_wave_alert"] = cond_abs | cond_rel
    return out


def to_weather_data_schema(df: pd.DataFrame) -> pd.DataFrame:
    """
    weather_data 테이블(Supabase) 스키마로 매핑.

    - temp_mean → temp_avg
    - rain_mm → precipitation
    - wind_max_10m → wind_speed (일 최대 풍속으로 대체)
    - snow_cm 은 테이블에 없어 제외
    """
    out = df.rename(
        columns={
            "temp_mean": "temp_avg",
            "rain_mm": "precipitation",
            "wind_max_10m": "wind_speed",
        }
    ).copy()

    table_cols = [
        "date",
        "region",
        "temp_min",
        "temp_max",
        "temp_avg",
        "precipitation",
        "wind_speed",
        "cold_wave_alert",
        "source",
    ]
    for col in table_cols:
        if col not in out.columns:
            out[col] = pd.NA
    return out[table_cols]
