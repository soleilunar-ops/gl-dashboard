"""
외부 기상 데이터 로더 (Open-Meteo ECMWF, CDS ERA5).

기상청(공공데이터포털) API는 `data_pipeline.kma_api` 에 모아 두었고,
여기서는 호환용으로 일부 이름만 re-export 한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from .kma_api import fetch_kma_midterm_forecast, fetch_kma_weather_alerts
from .open_meteo_ecmwf import OpenMeteoEcmwfConfig, fetch_ecmwf_daily_forecast


@dataclass
class WeatherLoaderConfig:
    """TODO: 좌표 다건(지역별판매트렌드 조인) 여부 확정."""

    latitude: float
    longitude: float
    timeout_sec: float = 30.0


def fetch_open_meteo_ecmwf_daily(
    cfg: WeatherLoaderConfig,
    *,
    forecast_days: int = 16,
    daily_variables: list[str] | None = None,
    timezone: str = "Asia/Seoul",
    cache_dir: str = ".cache",
    cache_expire_sec: int = 3600,
) -> pd.DataFrame:
    """
    Open-Meteo ECMWF 일별 예보(단기~중기 일수는 forecast_days 로 조절, 최대는 API 정책 따름).

    과거 구간(start/end) 조회가 아니라 **예보 run** 기준이므로 날짜 인자는 사용하지 않는다.
    """
    om = OpenMeteoEcmwfConfig(
        latitude=cfg.latitude,
        longitude=cfg.longitude,
        timezone=timezone,
        forecast_days=forecast_days,
        daily_variables=tuple(daily_variables) if daily_variables else None,
        cache_dir=cache_dir,
        cache_expire_sec=cache_expire_sec,
    )
    return fetch_ecmwf_daily_forecast(om)


def fetch_forecast_from_supabase(
    client,
    *,
    issued_date: str | None = None,
    horizon_days: int = 15,
    page_size: int = 1000,
) -> pd.DataFrame:
    """
    Supabase weather_unified(source='forecast')에서 미래 예보 로드.

    Args:
        client: supabase client
        issued_date: 예보 발표일 (YYYY-MM-DD). None이면 가장 최근 issued_date 사용
        horizon_days: 오늘 기준 앞으로 며칠까지 가져올지

    Returns:
        DataFrame: weather_date, station, temp_avg, temp_min, temp_max,
                   wind_avg, rain, precipitation, snowfall, issued_date, forecast_day
    """
    from datetime import date, timedelta
    today = date.today()
    end = today + timedelta(days=horizon_days)

    query = client.table("weather_unified").select(
        "weather_date,station,temp_avg,temp_min,temp_max,wind_avg,"
        "rain,precipitation,snowfall,issued_date,forecast_day"
    ).eq("source", "forecast").gte("weather_date", today.isoformat()).lte(
        "weather_date", end.isoformat()
    )
    if issued_date:
        query = query.eq("issued_date", issued_date)
    query = query.order("weather_date")

    rows: list[dict] = []
    offset = 0
    while True:
        res = query.range(offset, offset + page_size - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["weather_date"] = pd.to_datetime(df["weather_date"])
    return df


def fetch_cds_era5_temperature(
    *,
    personal_token: str,
    request_bounds: dict[str, Any],
) -> pd.DataFrame:
    """CDS ERA5 과거 기온. TODO: GRIB/NetCDF 파이프라인 및 공간 집계 규칙 확정."""
    _ = (personal_token, request_bounds)
    raise NotImplementedError("TODO: CDS 클라이언트·다운로드 워크플로 확정 후 구현")


__all__ = [
    "WeatherLoaderConfig",
    "fetch_open_meteo_ecmwf_daily",
    "fetch_forecast_from_supabase",
    "fetch_kma_midterm_forecast",
    "fetch_kma_weather_alerts",
    "fetch_cds_era5_temperature",
]
