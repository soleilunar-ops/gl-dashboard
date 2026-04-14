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
]


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
    """
    rename = {
        "temperature_2m_max": "temp_max",
        "temperature_2m_min": "temp_min",
        "precipitation_sum": "rain_mm",
        "windspeed_10m_max": "wind_max_10m",
    }
    out = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    if "temp_max" in out.columns and "temp_min" in out.columns:
        out["temp_mean"] = (out["temp_max"] + out["temp_min"]) / 2.0
    return out
