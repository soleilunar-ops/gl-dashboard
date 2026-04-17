"""
날짜×SKU 통합 테이블용 파생 변수 생성.

일교차(temp_range) 및 전일 대비 기온 변화는 반드시 포함한다.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd


def ensure_datetime(df: pd.DataFrame, col: str) -> pd.Series:
    """TODO: 타임존 처리(Asia/Seoul) 일관성 확정."""
    return pd.to_datetime(df[col])


def add_temp_range(df: pd.DataFrame, max_col: str, min_col: str, out_col: str = "temp_range") -> pd.DataFrame:
    """일교차 = 최고기온 - 최저기온."""
    out = df.copy()
    out[out_col] = out[max_col] - out[min_col]
    return out


def add_temp_change_vs_prev_day(
    df: pd.DataFrame,
    *,
    group_keys: Iterable[str],
    date_col: str,
    temp_col: str,
    out_col: str = "temp_change_vs_prev_day",
) -> pd.DataFrame:
    """
    전일 대비 평균기온(또는 대표 기온) 변화.

    group_keys:
        TODO: 지역별 기온을 쓰면 (region, sku) 등 그룹 키 확정.
        단일 관측 지역만 쓰면 (sku,) 또는 전역 한 줄로 처리 가능.
    """
    out = df.copy()
    out = out.sort_values(list(group_keys) + [date_col])
    g = out.groupby(list(group_keys), sort=False)[temp_col].diff()
    out[out_col] = g
    return out


def add_day_of_week(df: pd.DataFrame, date_col: str, out_col: str = "day_of_week") -> pd.DataFrame:
    out = df.copy()
    out[out_col] = ensure_datetime(out, date_col).dt.dayofweek
    return out


def add_season_flag_hotpack(
    df: pd.DataFrame,
    date_col: str,
    out_col: str = "season_flag",
) -> pd.DataFrame:
    """
    핫팩 계절성 플래그(초안).

    TODO: 시즌 시작·종료 정의(기온 임계·월 경계·내부 캘린더)는 alert_logic 및 사업 규칙 확정 후 단일 소스로 통일.
    현재는 플레이스홀더로 월 기반 임시 분류를 넣지 않음(임의 비즈니스 규칙 확정 방지).
    """
    out = df.copy()
    out[out_col] = np.nan
    return out


def merge_marketing_features(
    base: pd.DataFrame,
    marketing: pd.DataFrame,
    *,
    on: list[str],
    how: str = "left",
) -> pd.DataFrame:
    """날짜×SKU 기준 마케팅 속성 병합. TODO: 다중 캠페인 동시 존재 시 집계 규칙(합산/우선순위)."""
    return base.merge(marketing, on=on, how=how)


def merge_weather_features(
    base: pd.DataFrame,
    weather: pd.DataFrame,
    *,
    on: list[str],
    how: str = "left",
) -> pd.DataFrame:
    """
    기상 피처 병합.

    on:
        TODO: 기준이 date 단독인지, (date, region)인지 확정.
    """
    return base.merge(weather, on=on, how=how)


def build_model_feature_matrix(
    df: pd.DataFrame,
    feature_cols: list[str],
) -> tuple[pd.DataFrame, list[str]]:
    """
    학습/추론용 행 정리. 결측 행 제외 정책은 TODO.
    """
    cols_present = [c for c in feature_cols if c in df.columns]
    missing_defined = [c for c in feature_cols if c not in df.columns]
    if missing_defined:
        raise KeyError(f"TODO: 피처 컬럼 준비 누락: {missing_defined}")
    return df[cols_present], cols_present
