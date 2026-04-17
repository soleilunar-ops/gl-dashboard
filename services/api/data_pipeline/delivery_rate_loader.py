"""
쿠팡 납품률 xlsx 로더.

원본: data/raw/logistics/납품률(20250413-20260418).xlsx
- 121행 × 18컬럼, 주차(Week of Delivery) × 카테고리(Sub Category) 집계
- 핵심 컬럼: Units Requested(발주 요청), Units Confirmed(확정), Units Received(입고)

핫팩군 = "Bath Acc. & Household Cleaning(목욕/청소용품)"
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

DEFAULT_PATH = Path("data/raw/logistics/납품률(20250413-20260418).xlsx")

# 납품률 CSV의 Bath Acc 카테고리명 (핫팩 포함)
HOTPACK_CATEGORY = "Bath Acc. & Household Cleaning(목욕/청소용품)"


def load_delivery_rate(path: Path | str = DEFAULT_PATH) -> pd.DataFrame:
    """
    납품률 전체 로드 + 숫자 파싱.

    Returns:
        DataFrame: week, year, week_num, sub_category, units_requested,
                   units_confirmed, units_received, fill_rate, confirm_rate
    """
    df = pd.read_excel(Path(path), sheet_name="report")

    # 숫자 컬럼 파싱 (쉼표 포함 문자열)
    num_cols = {
        "Units Requested(발주 요청 수량)": "units_requested",
        "Units Confirmed(협력사 확정 수량)": "units_confirmed",
        "Units Received(입고 수량)": "units_received",
    }
    for orig, new in num_cols.items():
        df[new] = pd.to_numeric(df[orig].astype(str).str.replace(",", ""), errors="coerce")

    df = df.rename(columns={
        "Week of Delivery": "week",
        "Sub Category(하위 카테고리)": "sub_category",
    })

    df["year"] = df["week"] // 100
    df["week_num"] = df["week"] % 100

    # ISO 월요일 기준 week_start 계산
    df["week_start"] = df.apply(
        lambda r: pd.Timestamp.fromisocalendar(int(r["year"]), int(r["week_num"]), 1),
        axis=1,
    )

    # fill_rate / confirm_rate
    req = df["units_requested"].replace(0, float("nan"))
    df["fill_rate"] = df["units_received"] / req
    df["confirm_rate"] = df["units_confirmed"] / req

    keep = [
        "week", "week_start", "year", "week_num", "sub_category",
        "units_requested", "units_confirmed", "units_received",
        "fill_rate", "confirm_rate",
    ]
    return df[keep].sort_values("week_start").reset_index(drop=True)


def load_hotpack_delivery(path: Path | str = DEFAULT_PATH) -> pd.DataFrame:
    """Bath Acc(핫팩군)만 필터."""
    df = load_delivery_rate(path)
    return df[df["sub_category"] == HOTPACK_CATEGORY].reset_index(drop=True)


def load_weekly_delivery_summary(path: Path | str = DEFAULT_PATH) -> pd.DataFrame:
    """
    전 카테고리 주차별 합산 (Model B용 전체 납품 패턴).

    Returns:
        DataFrame: week_start, total_requested, total_confirmed, total_received,
                   overall_fill_rate, hotpack_requested, hotpack_ratio
    """
    df = load_delivery_rate(path)

    total = df.groupby("week_start", as_index=False).agg(
        total_requested=("units_requested", "sum"),
        total_confirmed=("units_confirmed", "sum"),
        total_received=("units_received", "sum"),
    )

    hotpack = df[df["sub_category"] == HOTPACK_CATEGORY].groupby("week_start", as_index=False).agg(
        hotpack_requested=("units_requested", "sum"),
    )

    out = total.merge(hotpack, on="week_start", how="left")
    out["hotpack_requested"] = out["hotpack_requested"].fillna(0)
    req = out["total_requested"].replace(0, float("nan"))
    out["overall_fill_rate"] = out["total_received"] / req
    out["hotpack_ratio"] = out["hotpack_requested"] / req

    return out.sort_values("week_start").reset_index(drop=True)
