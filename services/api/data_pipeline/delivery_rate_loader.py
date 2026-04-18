"""
쿠팡 납품률 로더.

소스 옵션:
- Supabase `noncompliant_delivery` 테이블 (기본, PM 제공)
- data/raw/logistics/납품률(20250413-20260418).xlsx (fallback)

핫팩군 = "Bath Acc. & Household Cleaning(목욕/청소용품)"
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

DEFAULT_PATH = Path("data/raw/logistics/납품률(20250413-20260418).xlsx")

# 납품률 CSV의 Bath Acc 카테고리명 (핫팩 포함)
HOTPACK_CATEGORY = "Bath Acc. & Household Cleaning(목욕/청소용품)"


def _load_from_supabase(client, page_size: int = 1000) -> pd.DataFrame:
    """noncompliant_delivery 테이블 전체 조회 → xlsx 로더와 동일 스키마 반환."""
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            client.table("noncompliant_delivery")
            .select("year_week,sub_category,units_requested,units_confirmed,units_received")
            .order("year_week")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows).rename(columns={"year_week": "week"})
    df["week"] = pd.to_numeric(df["week"], errors="coerce").astype("Int64")
    for col in ("units_requested", "units_confirmed", "units_received"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _load_from_xlsx(path: Path | str) -> pd.DataFrame:
    df = pd.read_excel(Path(path), sheet_name="report")
    num_cols = {
        "Units Requested(발주 요청 수량)": "units_requested",
        "Units Confirmed(협력사 확정 수량)": "units_confirmed",
        "Units Received(입고 수량)": "units_received",
    }
    for orig, new in num_cols.items():
        df[new] = pd.to_numeric(df[orig].astype(str).str.replace(",", ""), errors="coerce")
    return df.rename(columns={
        "Week of Delivery": "week",
        "Sub Category(하위 카테고리)": "sub_category",
    })


def load_delivery_rate(
    path: Path | str = DEFAULT_PATH,
    *,
    client=None,
    prefer_supabase: bool = True,
) -> pd.DataFrame:
    """
    납품률 전체 로드 + 숫자 파싱.

    Args:
        path: fallback으로 쓸 xlsx 경로
        client: supabase client (prefer_supabase=True일 때 사용)
        prefer_supabase: True면 Supabase 먼저, 실패·빈 응답 시 xlsx

    Returns:
        DataFrame: week, year, week_num, sub_category, units_requested,
                   units_confirmed, units_received, fill_rate, confirm_rate
    """
    df: pd.DataFrame | None = None
    if prefer_supabase and client is not None:
        try:
            df = _load_from_supabase(client)
            if df.empty:
                print("  noncompliant_delivery 빈 응답, xlsx로 fallback")
                df = None
            else:
                print(f"  noncompliant_delivery 로드: {len(df)}행")
        except Exception as ex:
            print(f"  noncompliant_delivery 조회 실패({ex}), xlsx fallback")
            df = None

    if df is None:
        df = _load_from_xlsx(path)

    df["year"] = df["week"].astype(int) // 100
    df["week_num"] = df["week"].astype(int) % 100

    df["week_start"] = df.apply(
        lambda r: pd.Timestamp.fromisocalendar(int(r["year"]), int(r["week_num"]), 1),
        axis=1,
    )

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
