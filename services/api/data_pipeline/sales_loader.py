"""
쿠팡·내부 판매 관련 확정 데이터 소스 로더.

실제 CSV/엑셀 컬럼명은 파일 버전마다 다를 수 있으므로 매핑은 외부 설정으로 주입한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass
class SalesSourceConfig:
    """원천 파일 경로. TODO: 실제 배치 경로·스케줄 확정."""

    coupang_sales_status_path: Path | None = None  # 쿠팡판매현황
    daily_kpi_path: Path | None = None  # 일간종합성과지표
    sales_forecast_official_path: Path | None = None  # 판매예상정보
    delivery_rate_path: Path | None = None  # 납품률
    regional_sales_trend_path: Path | None = None  # 지역별판매트렌드


def _read_table(path: Path, *, read_kw: dict[str, Any] | None = None) -> pd.DataFrame:
    read_kw = read_kw or {}
    suf = path.suffix.lower()
    if suf in {".csv"}:
        return pd.read_csv(path, **read_kw)
    if suf in {".xlsx", ".xls"}:
        return pd.read_excel(path, **read_kw)
    raise ValueError(f"TODO: 지원 확장자 확정 및 구현: {path}")


def load_coupang_sales_status(
    path: Path,
    column_map: dict[str, str],
    *,
    read_kw: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """
    쿠팡판매현황 적재.

    Args:
        column_map: 원본 컬럼명 -> 논리 컬럼명. TODO: 실제 원본 헤더 확정 후 채움.
    """
    df = _read_table(path, read_kw=read_kw)
    missing = [c for c in column_map if c not in df.columns]
    if missing:
        raise KeyError(f"TODO: 원본 컬럼 누락 또는 파일 버전 불일치: {missing}")
    return df.rename(columns=column_map)


def load_daily_kpi(path: Path, column_map: dict[str, str], *, read_kw: dict[str, Any] | None = None) -> pd.DataFrame:
    """일간종합성과지표. TODO: column_map 확정."""
    df = _read_table(path, read_kw=read_kw)
    missing = [c for c in column_map if c not in df.columns]
    if missing:
        raise KeyError(f"TODO: 원본 컬럼 누락: {missing}")
    return df.rename(columns=column_map)


def load_sales_forecast_official(
    path: Path, column_map: dict[str, str], *, read_kw: dict[str, Any] | None = None
) -> pd.DataFrame:
    """판매예상정보(쿠팡 공식). TODO: column_map 확정."""
    df = _read_table(path, read_kw=read_kw)
    missing = [c for c in column_map if c not in df.columns]
    if missing:
        raise KeyError(f"TODO: 원본 컬럼 누락: {missing}")
    return df.rename(columns=column_map)


def load_delivery_rate(path: Path, column_map: dict[str, str], *, read_kw: dict[str, Any] | None = None) -> pd.DataFrame:
    """납품률. TODO: column_map 확정."""
    df = _read_table(path, read_kw=read_kw)
    missing = [c for c in column_map if c not in df.columns]
    if missing:
        raise KeyError(f"TODO: 원본 컬럼 누락: {missing}")
    return df.rename(columns=column_map)


def load_regional_sales_trend(
    path: Path, column_map: dict[str, str], *, read_kw: dict[str, Any] | None = None
) -> pd.DataFrame:
    """지역별판매트렌드. TODO: 지역 키를 날씨 좌표/권역과 조인하는 규칙 확정."""
    df = _read_table(path, read_kw=read_kw)
    missing = [c for c in column_map if c not in df.columns]
    if missing:
        raise KeyError(f"TODO: 원본 컬럼 누락: {missing}")
    return df.rename(columns=column_map)
