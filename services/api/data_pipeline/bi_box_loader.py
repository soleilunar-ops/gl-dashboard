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


def _load_from_supabase_daily(
    client, skus: Iterable[int] | None = None, page_size: int = 1000
) -> pd.DataFrame:
    """bi_box_daily 테이블에서 벤더아이템 단위 raw 조회 → CSV 로더와 동일 스키마로 반환.

    Supabase는 이미 집계 후 PK=(date, sku_id, vendor_item_id) 단위. bi_box_share는 0~100.
    """
    query = client.table("bi_box_daily").select(
        "date,sku_id,sku_name,vendor_item_id,vendor_item_name,"
        "min_price,mid_price,max_price,bi_box_share,is_stockout"
    )
    if skus is not None:
        query = query.in_("sku_id", [str(s) for s in skus])

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
    df["date"] = pd.to_datetime(df["date"])
    df["coupang_sku_id"] = pd.to_numeric(df["sku_id"], errors="coerce").astype("Int64")
    # Supabase 저장 포맷(0~100) → CSV 로더 포맷(0~1)
    df["bi_box_share"] = pd.to_numeric(df["bi_box_share"], errors="coerce") / 100.0
    df["is_stockout"] = df["is_stockout"].fillna(False).astype(bool)
    for c in ("min_price", "mid_price", "max_price"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def load_bi_box_all(
    directory: Path | str = DEFAULT_DIR,
    skus: Iterable[int] | None = None,
    *,
    client=None,
    prefer_supabase: bool = True,
) -> pd.DataFrame:
    """
    바이박스 daily 집계 데이터.

    Args:
        directory: 바이박스 CSV 폴더 (fallback)
        skus: 필터할 SKU 목록 (None이면 전체)
        client: supabase client (prefer_supabase=True일 때 우선 사용)
        prefer_supabase: True면 Supabase bi_box_daily 먼저, 실패·빈 응답 시 CSV

    Returns:
        DataFrame: date, coupang_sku_id, is_stockout, min_price, mid_price,
                   max_price, bi_box_share, source
    """
    df: pd.DataFrame | None = None

    if prefer_supabase and client is not None:
        try:
            df = _load_from_supabase_daily(client, skus)
            if df.empty:
                df = None
        except Exception as ex:
            print(f"  bi_box_daily 조회 실패({ex}), CSV fallback")
            df = None

    if df is None:
        base = Path(directory)
        files = sorted(base.glob("*.csv"))
        if not files:
            raise FileNotFoundError(f"바이박스 CSV 없음: {base.resolve()}")
        frames = [_normalize(_read_bi_box_csv(f)) for f in files]
        df = pd.concat(frames, ignore_index=True)
        if skus is not None:
            df = df[df["coupang_sku_id"].isin(list(skus))].copy()

    # SKU × 일자 단위 집계 (벤더아이템 여러 개 → 하나로 합산)
    agg = df.groupby(["date", "coupang_sku_id"], as_index=False).agg(
        is_stockout=("is_stockout", "any"),
        min_price=("min_price", "min"),
        mid_price=("mid_price", "median"),
        max_price=("max_price", "max"),
        bi_box_share=("bi_box_share", "max"),
    )
    agg["source"] = "bi_box_daily" if (prefer_supabase and client is not None) else "bi_box_csv"
    return agg.sort_values(["date", "coupang_sku_id"]).reset_index(drop=True)


def build_sku_name_map(
    directory: Path | str = DEFAULT_DIR,
    skus: Iterable[int] | None = None,
    *,
    client=None,
    prefer_supabase: bool = True,
) -> dict[int, str]:
    """SKU ID → 제품명 매핑. Supabase bi_box_daily 우선, CSV fallback."""

    if prefer_supabase and client is not None:
        try:
            query = client.table("bi_box_daily").select("sku_id, sku_name")
            if skus is not None:
                query = query.in_("sku_id", [str(s) for s in skus])
            rows: list[dict] = []
            offset = 0
            while True:
                res = query.range(offset, offset + 999).execute()
                batch = res.data or []
                rows.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
            if rows:
                df = pd.DataFrame(rows).drop_duplicates("sku_id")
                return {
                    int(r["sku_id"]): str(r["sku_name"])
                    for _, r in df.iterrows()
                    if r.get("sku_name")
                }
        except Exception:
            pass

    base = Path(directory)
    files = sorted(base.glob("*.csv"))
    if not files:
        return {}

    frames = [_normalize(_read_bi_box_csv(f)) for f in files]
    df = pd.concat(frames, ignore_index=True)
    if skus is not None:
        df = df[df["coupang_sku_id"].isin(list(skus))]
    names = df.drop_duplicates("coupang_sku_id").set_index("coupang_sku_id")["sku_name"]
    return {int(k): str(v) for k, v in names.items()}


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
