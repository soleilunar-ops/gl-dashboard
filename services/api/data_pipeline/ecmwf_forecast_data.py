"""
ECMWF 예보 원천: Open Data(0~15일, 키 불필요)와 S2S/API(16~46일, ECMWF 키·권한).

역할 분리:
  - **HTTP로 바로 쓸 때(수요예측 피처 단순화)**: `open_meteo_ecmwf.py` + `weather_loader.fetch_open_meteo_ecmwf_daily`
  - **GRIB 파일이 필요할 때(본 모듈)**: `ecmwf-opendata` 로 HRES 등 다운로드 후 cfgrib/xarray 로 파싱

의존성(선택 설치):
  - 필수(다운로드만): ecmwf-opendata
  - S2S: ecmwf-api-client + ~/.ecmwfapirc 또는 환경 변수 (ECMWF 문서 참고)
  - GRIB 읽기: xarray, cfgrib (+ 시스템에 eccodes — Windows 는 설치가 까다로울 수 있음)

변경 이유: 사용자 제공 ECMWF·GRIB 파이프라인을 한 파일로 정리해 유지보수하기 위함
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# 선택 import — 미설치 시 각 함수에서 명확히 안내
# ---------------------------------------------------------------------------
try:
    from ecmwf.opendata import Client as OpenDataClient
except ImportError:
    OpenDataClient = None

try:
    from ecmwfapi import ECMWFDataServer
except ImportError:
    ECMWFDataServer = None

try:
    import xarray as xr
except ImportError:
    xr = None


def _require_opendata_client():
    if OpenDataClient is None:
        raise ImportError("ecmwf-opendata 가 필요합니다: pip install ecmwf-opendata")


def _require_xarray_cfgrib():
    if xr is None:
        raise ImportError("xarray 가 필요합니다: pip install xarray cfgrib (및 eccodes)")


# =========================
# 1. 다운로드
# =========================


def fetch_ecmwf_open_data_0_15_days(
    run_date: str,
    run_time: int = 0,
    out_dir: str | Path = "./data/ecmwf_open_0_15",
    *,
    use_ensemble: bool = False,
) -> str:
    """
    ECMWF Open Data에서 0~15일(최대 360h) 예보 GRIB2 저장. API 키 불필요.

    Parameters
    ----------
    run_date : str
        YYYYMMDD
    run_time : int
        0 또는 12 (UTC)
    use_ensemble : bool
        True 면 ENS control 시도, False 면 HRES(oper/fc)

    참고: Open Data 는 rolling archive 라 오래된 run 은 없을 수 있음.
    """
    _require_opendata_client()
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    client = OpenDataClient(source="ecmwf")
    params = ["2t", "tp", "10u", "10v", "msl"]

    if use_ensemble:
        stream, type_ = "enfo", "cf"
        filename = f"ecmwf_open_ens_cf_{run_date}_{run_time:02d}z_0_360h.grib2"
    else:
        stream, type_ = "oper", "fc"
        filename = f"ecmwf_open_hres_{run_date}_{run_time:02d}z_0_360h.grib2"

    target_file = out_path / filename

    try:
        client.retrieve(
            date=run_date,
            time=run_time,
            stream=stream,
            type=type_,
            step="0/to/360/by/6",
            param=params,
            target=str(target_file),
        )
    except Exception as e:
        raise RuntimeError(
            f"0~15일 Open Data 다운로드 실패: {e}\n"
            f"run_date={run_date}, run_time={run_time}, stream={stream}, type={type_}"
        ) from e

    return str(target_file)


def fetch_ecmwf_s2s_16_46_days(
    run_date: str,
    out_dir: str | Path = "./data/ecmwf_s2s_16_46",
    area: Optional[str] = None,
    grid: str = "0.5/0.5",
) -> dict[str, str]:
    """
    ECMWF S2S(16~46일) 다운로드. **API 키·접근 권한 필요** (ecmwf-api-client).

    run_date: YYYY-MM-DD
    area: "N/W/S/E" 예: "45/120/30/135"
    """
    if ECMWFDataServer is None:
        raise ImportError("ecmwf-api-client 가 필요합니다: pip install ecmwf-api-client")

    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    server = ECMWFDataServer()

    base_request: dict[str, Any] = {
        "dataset": "s2s",
        "class": "s2",
        "origin": "ecmf",
        "stream": "enfo",
        "expver": "prod",
        "levtype": "sfc",
        "step": "384/to/1104/by/24",
        "date": run_date,
        "time": "00:00:00",
        "param": "167.128/228.128/165.128/166.128/151.128",
        "grid": grid,
        "format": "grib",
    }
    if area:
        base_request["area"] = area

    cf_target = str(out_path / f"s2s_ecmwf_cf_{run_date}_16_46days.grib")
    pf_target = str(out_path / f"s2s_ecmwf_pf_{run_date}_16_46days.grib")

    cf_request = {**base_request, "type": "cf", "target": cf_target}
    pf_request = {**base_request, "type": "pf", "number": "1/to/50", "target": pf_target}

    try:
        server.retrieve(cf_request)
        server.retrieve(pf_request)
    except Exception as e:
        raise RuntimeError(
            f"16~46일 S2S 다운로드 실패: {e}\n"
            f"run_date={run_date}\n"
            "TODO: S2S 접근권한, API 키(.ecmwfapirc), 실행일·파라미터 조합 확인"
        ) from e

    return {"cf": cf_target, "pf": pf_target}


# =========================
# 2. GRIB -> xarray -> pandas
# =========================


def _open_grib_dataset(grib_path: str, filter_by_keys: Optional[dict] = None) -> Any:
    _require_xarray_cfgrib()
    backend_kwargs: dict[str, Any] = {}
    if filter_by_keys:
        backend_kwargs["filter_by_keys"] = filter_by_keys
    return xr.open_dataset(
        grib_path,
        engine="cfgrib",
        backend_kwargs=backend_kwargs,
    )


def open_multiple_params_as_dataframe(grib_path: str) -> pd.DataFrame:
    """동일 GRIB 내 주요 surface 변수를 long 형 DataFrame 으로 병합."""
    param_filters = {
        "2t": {"shortName": "2t"},
        "tp": {"shortName": "tp"},
        "10u": {"shortName": "10u"},
        "10v": {"shortName": "10v"},
        "msl": {"shortName": "msl"},
    }
    frames: list[pd.DataFrame] = []

    for var_name, filter_keys in param_filters.items():
        try:
            ds = _open_grib_dataset(grib_path, filter_by_keys=filter_keys)
            df = ds.to_dataframe().reset_index()
            value_cols = [
                c
                for c in df.columns
                if c not in {"time", "step", "surface", "latitude", "longitude", "valid_time", "number"}
            ]
            value_col = None
            for c in value_cols:
                if c == var_name:
                    value_col = c
                    break
            if value_col is None and value_cols:
                value_col = value_cols[0]
            if value_col is None:
                continue

            keep_cols = [c for c in ["time", "step", "valid_time", "number", "latitude", "longitude"] if c in df.columns]
            out = df[keep_cols + [value_col]].copy()
            out["variable"] = var_name
            out.rename(columns={value_col: "value"}, inplace=True)
            frames.append(out)
        except Exception as e:
            print(f"[WARN] {var_name} 열기 실패: {e}")

    if not frames:
        raise ValueError(f"파일에서 읽을 수 있는 변수가 없습니다: {grib_path}")
    return pd.concat(frames, ignore_index=True)


# =========================
# 3. wide + 기초 feature
# =========================


def long_to_wide_weather_df(df_long: pd.DataFrame) -> pd.DataFrame:
    index_cols = [c for c in ["time", "step", "valid_time", "number", "latitude", "longitude"] if c in df_long.columns]
    df_wide = (
        df_long.pivot_table(index=index_cols, columns="variable", values="value", aggfunc="first").reset_index()
    )
    df_wide.columns.name = None
    return df_wide


def add_basic_weather_features(df: pd.DataFrame) -> pd.DataFrame:
    """TODO: ECMWF 단위·누적 강수 정의는 제품 문서로 재검증."""
    out = df.copy()
    if "2t" in out.columns:
        out["t2m_c"] = out["2t"] - 273.15
    if "10u" in out.columns and "10v" in out.columns:
        out["wind_speed_10m"] = np.sqrt(out["10u"] ** 2 + out["10v"] ** 2)
    if "tp" in out.columns:
        out["tp_mm"] = out["tp"] * 1000.0
    if "t2m_c" in out.columns and "wind_speed_10m" in out.columns:
        out["apparent_cold_index"] = out["t2m_c"] - 0.7 * out["wind_speed_10m"]
    if "valid_time" in out.columns:
        out["valid_date"] = pd.to_datetime(out["valid_time"]).dt.date
        out["weekday"] = pd.to_datetime(out["valid_time"]).dt.weekday
        out["is_weekend"] = out["weekday"].isin([5, 6]).astype(int)
    return out


def aggregate_daily_features(
    df: pd.DataFrame,
    group_cols: Optional[list[str]] = None,
) -> pd.DataFrame:
    out = df.copy()
    if "valid_date" not in out.columns and "valid_time" in out.columns:
        out["valid_date"] = pd.to_datetime(out["valid_time"]).dt.date

    base_group_cols = [c for c in ["valid_date", "latitude", "longitude", "number"] if c in out.columns]
    if group_cols:
        base_group_cols = group_cols

    agg_map: dict[str, str] = {}
    for col in ["t2m_c", "apparent_cold_index", "wind_speed_10m", "tp_mm", "msl"]:
        if col in out.columns:
            agg_map[col] = "sum" if col == "tp_mm" else "mean"

    if "t2m_c" in out.columns:
        grouped = out.groupby(base_group_cols)
        result = grouped.agg(agg_map).reset_index()
        t_stats = grouped["t2m_c"].agg(["min", "max"]).reset_index().rename(columns={"min": "t2m_c_min", "max": "t2m_c_max"})
        result = result.merge(t_stats, on=base_group_cols, how="left")
    else:
        result = out.groupby(base_group_cols).agg(agg_map).reset_index()
    return result


def summarize_ensemble_daily(df_daily: pd.DataFrame) -> pd.DataFrame:
    if "number" not in df_daily.columns:
        return df_daily.copy()

    group_cols = [c for c in ["valid_date", "latitude", "longitude"] if c in df_daily.columns]
    target_cols = [
        c
        for c in ["t2m_c", "t2m_c_min", "t2m_c_max", "wind_speed_10m", "tp_mm", "apparent_cold_index", "msl"]
        if c in df_daily.columns
    ]
    if not target_cols:
        return df_daily.copy()

    rows: list[dict[str, Any]] = []
    grouped = df_daily.groupby(group_cols)
    for keys, g in grouped:
        row: dict[str, Any] = {}
        if isinstance(keys, tuple):
            for col, val in zip(group_cols, keys):
                row[col] = val
        else:
            row[group_cols[0]] = keys
        for col in target_cols:
            vals = g[col].dropna().values
            if len(vals) == 0:
                continue
            row[f"{col}_ens_mean"] = float(np.mean(vals))
            row[f"{col}_ens_std"] = float(np.std(vals, ddof=0))
            row[f"{col}_ens_p10"] = float(np.quantile(vals, 0.10))
            row[f"{col}_ens_p50"] = float(np.quantile(vals, 0.50))
            row[f"{col}_ens_p90"] = float(np.quantile(vals, 0.90))
        rows.append(row)
    return pd.DataFrame(rows)


def build_forecast_feature_table(
    grib_path: str,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """GRIB 하나에서 long / wide / 일별(앙상블 요약 포함) 테이블 생성."""
    df_long = open_multiple_params_as_dataframe(grib_path)
    df_wide = long_to_wide_weather_df(df_long)
    df_feat = add_basic_weather_features(df_wide)
    df_daily = aggregate_daily_features(df_feat)
    if "number" in df_daily.columns:
        df_ens = summarize_ensemble_daily(df_daily)
    else:
        df_ens = df_daily.copy()
    return df_long, df_wide, df_ens


@dataclass
class EcmwfOpenPipelineResult:
    """예시 실행 산출물 경로."""

    grib_path: str
    long_csv: Path
    wide_csv: Path
    daily_csv: Path


def run_open_data_0_15_pipeline(
    *,
    run_date: str | None = None,
    run_time: int = 0,
    out_dir: str | Path = "./data/ecmwf_open_0_15",
    export_csv_dir: str | Path = "./output/ecmwf_open_0_15",
    use_ensemble: bool = False,
) -> EcmwfOpenPipelineResult:
    """
    0~15일 GRIB 다운로드 후 long/wide/daily CSV 저장.

    run_date 가 None 이면 오늘(UTC) 기준.
    """
    if run_date is None:
        run_date = datetime.now(timezone.utc).strftime("%Y%m%d")

    grib = fetch_ecmwf_open_data_0_15_days(
        run_date, run_time=run_time, out_dir=out_dir, use_ensemble=use_ensemble
    )
    long_df, wide_df, daily_df = build_forecast_feature_table(grib)

    export_path = Path(export_csv_dir)
    export_path.mkdir(parents=True, exist_ok=True)
    long_csv = export_path / "open_0_15_long.csv"
    wide_csv = export_path / "open_0_15_wide.csv"
    daily_csv = export_path / "open_0_15_daily_features.csv"
    long_df.to_csv(long_csv, index=False)
    wide_df.to_csv(wide_csv, index=False)
    daily_df.to_csv(daily_csv, index=False)

    return EcmwfOpenPipelineResult(
        grib_path=grib,
        long_csv=long_csv,
        wide_csv=wide_csv,
        daily_csv=daily_csv,
    )
