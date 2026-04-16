"""
쿠팡 바이박스분석 CSV 로더.

data/raw/coupang/bi_box/*.csv 파일들을 읽어 34 SKU × 일자 단위로 정리한다.

원본 스키마(13컬럼):
  날짜, SKU ID, SKU Name, 벤더아이템 ID, VIID 명, 최저가, 중간가, 최고가,
  바이박스 점유율, 재고 없음, 단위가격 조건, 개당가격 조건, 상품속성 오류

추출하는 핵심 피처:
  - is_stockout (재고 없음 == true)
  - min_price (최저가, 시장 최저 노출가)
  - bi_box_share (바이박스 점유율, 검색 노출 비중)

같은 SKU가 하루 여러 벤더아이템으로 집계되므로 (date × coupang_sku_id) 단위로:
  - is_stockout = any(재고 없음)   # 하나라도 품절이면 해당 SKU 그 날 품절로 간주
  - min_price   = min(최저가)
  - bi_box_share = max(바이박스 점유율)
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd

DEFAULT_DIR = Path("data/raw/coupang/bi_box")


def _parse_percent(series: pd.Series) -> pd.Series:
    """'100.0000%' → 1.0 (0~1 비율). 빈 값/NaN은 NaN 유지."""
    s = series.astype(str).str.rstrip("%").str.strip()
    num = pd.to_numeric(s, errors="coerce") / 100.0
    return num


def _read_bi_box_csv(path: Path) -> pd.DataFrame:
    """바이박스 CSV 한 개 읽기 (utf-8-sig, 쉼표 구분, 따옴표 래핑)."""
    df = pd.read_csv(path, encoding="utf-8-sig")
    return df


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    """원본 한글 컬럼 → 영문 피처 컬럼으로 정규화 + 타입 캐스팅."""
    rename = {
        "날짜": "date",
        "SKU ID": "coupang_sku_id",
        "SKU Name": "sku_name",
        "벤더아이템 ID": "vendor_item_id",
        "VIID 명": "vendor_item_name",
        "최저가": "min_price",
        "중간가": "mid_price",
        "최고가": "max_price",
        "바이박스 점유율": "bi_box_share",
        "재고 없음": "is_stockout_raw",
        "단위가격 조건": "unit_price_flag",
        "개당가격 조건": "each_price_flag",
        "상품속성 오류": "attribute_error",
    }
    out = df.rename(columns=rename).copy()

    # 날짜 파싱 (YYYYMMDD 정수 문자열)
    out["date"] = pd.to_datetime(out["date"].astype(str), format="%Y%m%d", errors="coerce")

    out["coupang_sku_id"] = pd.to_numeric(out["coupang_sku_id"], errors="coerce").astype("Int64")

    for col in ["min_price", "mid_price", "max_price"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")

    if "bi_box_share" in out.columns:
        out["bi_box_share"] = _parse_percent(out["bi_box_share"])

    # 재고 없음 / 단위가격 / 개당가격 / 상품속성 오류: 문자열 'true'/'false' → bool
    bool_cols = ["is_stockout_raw", "unit_price_flag", "each_price_flag", "attribute_error"]
    for col in bool_cols:
        if col in out.columns:
            out[col] = out[col].astype(str).str.strip().str.lower().eq("true")

    out = out.rename(columns={"is_stockout_raw": "is_stockout"})
    return out


def load_bi_box_all(
    directory: Path | str = DEFAULT_DIR,
    skus: Iterable[int] | None = None,
) -> pd.DataFrame:
    """
    bi_box 디렉토리의 모든 CSV 로드 → SKU-일자 집계.

    Args:
        directory: 바이박스 CSV 폴더
        skus: 필터할 SKU 목록 (None이면 전체)

    Returns:
        DataFrame: date, coupang_sku_id, is_stockout, min_price, mid_price,
                   max_price, bi_box_share, source
    """
    base = Path(directory)
    files = sorted(base.glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"바이박스 CSV 없음: {base.resolve()}")

    frames = [_normalize(_read_bi_box_csv(f)) for f in files]
    df = pd.concat(frames, ignore_index=True)

    if skus is not None:
        df = df[df["coupang_sku_id"].isin(list(skus))].copy()

    # SKU × 일자 단위 집계 (벤더아이템 여러 개)
    agg = df.groupby(["date", "coupang_sku_id"], as_index=False).agg(
        is_stockout=("is_stockout", "any"),
        min_price=("min_price", "min"),
        mid_price=("mid_price", "median"),
        max_price=("max_price", "max"),
        bi_box_share=("bi_box_share", "max"),
    )
    agg["source"] = "bi_box_csv"
    return agg.sort_values(["date", "coupang_sku_id"]).reset_index(drop=True)


def aggregate_weekly_bi_box(daily_df: pd.DataFrame) -> pd.DataFrame:
    """
    일자 단위 bi_box DF → 주단위 집계 (weekly_feature_builder에 merge 용).

    Returns:
        DataFrame: week_start, coupang_sku_id, weekly_stockout_days,
                   weekly_min_price, weekly_bi_box_share_mean
    """
    if daily_df.empty:
        return daily_df

    out = daily_df.copy()
    out["week_start"] = out["date"] - pd.to_timedelta(out["date"].dt.weekday, unit="D")
    out["week_start"] = out["week_start"].dt.normalize()

    weekly = out.groupby(["week_start", "coupang_sku_id"], as_index=False).agg(
        weekly_stockout_days=("is_stockout", "sum"),
        weekly_min_price=("min_price", "min"),
        weekly_bi_box_share_mean=("bi_box_share", "mean"),
        days_observed_bi_box=("date", "nunique"),
    )
    weekly["weekly_stockout_flag"] = (weekly["weekly_stockout_days"] > 0).astype(int)
    return weekly
