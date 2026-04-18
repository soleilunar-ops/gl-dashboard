"""
로컬 모드 주단위 피처 빌더.

판매:
- daily_performance (Supabase)

날씨:
- v_weather_hybrid (Supabase 뷰, ASOS+ERA5 조인) ← 기본
- data/processed/asos_weather_cache.csv ← fallback

바이박스:
- bi_box_daily (Supabase) or data/raw/coupang/bi_box/*.csv (fallback)
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import pandas as pd

PROCESSED_DIR = Path("data/processed")
ASOS_CACHE = PROCESSED_DIR / "asos_weather_cache.csv"

# 기상청 관측소 한글명 ↔ KMA ID ↔ 지역 코드 (로컬 CSV 스키마와 맞춤)
STATION_KR_TO_ID = {"서울": 108, "수원": 119, "대전": 133, "광주": 156, "부산": 159}
STATION_ID_TO_REGION = {108: "seoul", 119: "gyeonggi", 133: "daejeon", 156: "gwangju", 159: "busan"}

# 34 핫팩 SKU
WARMER_SKUS: tuple[int, ...] = (
    66805009, 63575566, 63448701, 63407190, 63216406, 63066151, 62936075,
    55872727, 51745713, 50831847, 50117045, 49540284, 49118115, 40924062,
    40851591, 39808552, 38792460, 38696876, 38679042, 38548865, 34483110,
    34479452, 28476643, 28476250, 28455663, 28453740, 28453721, 28433916,
    10657274, 10642412, 9435691, 2328921, 2298273, 41856,
)


def _ensure_processed_dir():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


# ────────────────────────────────────────────
# 판매 (Supabase daily_performance)
# ────────────────────────────────────────────
def _fetch_daily_performance(client, skus: tuple[int, ...], page_size: int = 1000) -> pd.DataFrame:
    skus_str = [str(s) for s in skus]
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            client.table("daily_performance")
            .select(
                "sale_date,sku_id,units_sold,gmv,promo_units_sold,asp,"
                "conversion_rate,page_views,return_units,review_count,avg_rating"
            )
            .in_("sku_id", skus_str)
            .order("sale_date")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.rename(columns={
            "sale_date": "date",
            "sku_id": "coupang_sku_id",
            "promo_units_sold": "promo_units",
        })
        df["date"] = pd.to_datetime(df["date"])
        df["coupang_sku_id"] = pd.to_numeric(df["coupang_sku_id"], errors="coerce").astype("Int64")
    return df


def _aggregate_weekly_sales(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df["week_start"] = df["date"] - pd.to_timedelta(df["date"].dt.weekday, unit="D")
    df["week_start"] = df["week_start"].dt.normalize()
    if "review_count" not in df.columns:
        df["review_count"] = 0
    if "avg_rating" not in df.columns:
        df["avg_rating"] = pd.NA

    agg = df.groupby(["week_start", "coupang_sku_id"], as_index=False).agg(
        weekly_sales_qty=("units_sold", "sum"),
        weekly_return_qty=("return_units", "sum"),
        weekly_gmv=("gmv", "sum"),
        weekly_promo_units=("promo_units", "sum"),
        weekly_page_views=("page_views", "sum"),
        avg_asp=("asp", "mean"),
        avg_conversion_rate=("conversion_rate", "mean"),
        weekly_review_count=("review_count", "sum"),
        avg_rating=("avg_rating", "mean"),
        days_observed=("date", "nunique"),
    )
    agg["promotion_flag"] = (agg["weekly_promo_units"] > 0).astype(int)
    agg = agg.rename(columns={"coupang_sku_id": "sku"})
    return agg.sort_values(["sku", "week_start"]).reset_index(drop=True)


# ────────────────────────────────────────────
# 날씨 (ASOS API → 로컬 CSV 캐시)
# ────────────────────────────────────────────
def _fetch_weather_from_supabase(
    client, start: str, end: str, page_size: int = 1000
) -> pd.DataFrame:
    """
    v_weather_hybrid 뷰에서 날씨 로드.

    반환 스키마는 ASOS 캐시 CSV와 동일하도록 매핑:
      date, station_id, region, temp_mean, temp_min, temp_max,
      rain_mm, wind_mean, snow_cm, cold_wave_alert, source
    """
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            client.table("v_weather_hybrid")
            .select(
                "weather_date,station,temp_avg,temp_min,temp_max,"
                "wind_avg,rain,snowfall"
            )
            .gte("weather_date", start)
            .lte("weather_date", end)
            .order("weather_date")
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

    df = pd.DataFrame(rows).rename(columns={
        "weather_date": "date",
        "temp_avg": "temp_mean",
        "wind_avg": "wind_mean",
        "rain": "rain_mm",
        "snowfall": "snow_cm",
    })
    df["date"] = pd.to_datetime(df["date"])
    df["station_id"] = df["station"].map(STATION_KR_TO_ID)
    df["region"] = df["station_id"].map(STATION_ID_TO_REGION)
    # 기상청 한파주의보 근사: 일 최저 ≤ -12℃ (2일 연속 조건은 주간 집계 단계에서 cold_days_7d로 반영)
    df["cold_wave_alert"] = df["temp_min"] <= -12
    df["source"] = "supabase_v_weather_hybrid"
    df = df.drop(columns=["station"])
    return df[["date", "station_id", "region", "temp_mean", "temp_min", "temp_max",
               "rain_mm", "wind_mean", "snow_cm", "cold_wave_alert", "source"]]


def _fetch_or_load_asos(
    start: str = "2024-01-01",
    end: str | None = None,
    *,
    client=None,
    prefer_supabase: bool = True,
) -> pd.DataFrame:
    """
    날씨 로드. Supabase v_weather_hybrid 우선, 실패 시 ASOS CSV 캐시 fallback.

    Args:
        client: supabase client (prefer_supabase=True일 때 필요)
        prefer_supabase: True면 Supabase 먼저, 실패·빈 응답 시 CSV 캐시
    """
    if end is None:
        from datetime import datetime, timedelta
        end = (datetime.today() - timedelta(days=2)).strftime("%Y-%m-%d")
    _ensure_processed_dir()

    if prefer_supabase and client is not None:
        try:
            df = _fetch_weather_from_supabase(client, start, end)
            if not df.empty:
                print(f"  v_weather_hybrid 로드: {len(df)}행 ({start}~{end})")
                return df
            print("  v_weather_hybrid 빈 응답, CSV 캐시로 fallback")
        except Exception as ex:
            print(f"  v_weather_hybrid 조회 실패({ex}), CSV 캐시로 fallback")

    if ASOS_CACHE.exists():
        df = pd.read_csv(ASOS_CACHE, parse_dates=["date"])
        print(f"  ASOS 캐시 로드: {len(df)}행 ({ASOS_CACHE})")
        return df

    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from data_sources.asos_api import fetch_asos_multi_station_daily, STATIONS

    periods = [
        (start, "2024-06-30"), ("2024-07-01", "2024-12-31"),
        ("2025-01-01", "2025-06-30"), ("2025-07-01", "2025-12-31"),
        ("2026-01-01", end),
    ]
    frames = []
    for s, e in periods:
        try:
            df = fetch_asos_multi_station_daily(s, e, stations=STATIONS)
            frames.append(df)
            print(f"  ASOS {s}~{e}: {len(df)}행")
        except Exception as ex:
            print(f"  ASOS {s}~{e} 실패: {ex}")

    if not frames:
        raise RuntimeError("ASOS 수집 전체 실패")
    merged = pd.concat(frames, ignore_index=True)
    merged.to_csv(ASOS_CACHE, index=False)
    print(f"  ASOS 캐시 저장: {ASOS_CACHE} ({len(merged)}행)")
    return merged


def _aggregate_weekly_weather(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    daily = df.groupby("date", as_index=False).agg(
        temp_min=("temp_min", "min"),
        temp_max=("temp_max", "max"),
        temp_mean=("temp_mean", "mean"),
        rain_mm=("rain_mm", "sum"),
        snow_cm=("snow_cm", "sum"),
        wind_mean=("wind_mean", "mean"),
        cold_wave_alert=("cold_wave_alert", "any"),
    )
    daily["week_start"] = daily["date"] - pd.to_timedelta(daily["date"].dt.weekday, unit="D")
    daily["week_start"] = daily["week_start"].dt.normalize()
    weekly = daily.groupby("week_start", as_index=False).agg(
        temp_mean=("temp_mean", "mean"),
        temp_min=("temp_min", "min"),
        temp_max=("temp_max", "max"),
        rain_mm=("rain_mm", "sum"),
        snow_cm=("snow_cm", "sum"),
        wind_mean=("wind_mean", "mean"),
        cold_days_7d=("cold_wave_alert", "sum"),
    )
    weekly["temp_range"] = weekly["temp_max"] - weekly["temp_min"]

    # first_snow_flag: 시즌(10월~4월) 내 첫 눈 주 = 1
    # [근거: 심층 분석 9번] 시즌 전환점 과소 예측 개선용
    weekly = weekly.sort_values("week_start").reset_index(drop=True)
    weekly["season_year"] = weekly["week_start"].apply(
        lambda d: d.year if d.month >= 10 else d.year - 1
    )
    weekly["first_snow_flag"] = 0
    for sy, grp in weekly.groupby("season_year"):
        snow_weeks = grp[grp["snow_cm"] > 0]
        if not snow_weeks.empty:
            first_idx = snow_weeks.index[0]
            weekly.loc[first_idx, "first_snow_flag"] = 1
    weekly = weekly.drop(columns=["season_year"])
    return weekly


# ────────────────────────────────────────────
# 품절 마스킹 + bi_box 피처
# ────────────────────────────────────────────
def _load_bi_box_and_mask(
    sales_raw: pd.DataFrame,
    skus: tuple[int, ...],
    apply_mask: bool = True,
    *,
    client=None,
) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """바이박스 (Supabase bi_box_daily 우선, CSV fallback) → 품절 마스킹 + 주단위 피처."""
    from data_pipeline.bi_box_loader import load_bi_box_all, aggregate_weekly_bi_box

    bi_box_daily = load_bi_box_all(skus=skus, client=client)
    bi_box_weekly = aggregate_weekly_bi_box(bi_box_daily)

    masked_rows = 0
    if apply_mask and not bi_box_daily.empty:
        stockout_days = bi_box_daily.loc[bi_box_daily["is_stockout"], ["date", "coupang_sku_id"]]
        if not stockout_days.empty:
            before = len(sales_raw)
            merged = sales_raw.merge(
                stockout_days.assign(_so=1), on=["date", "coupang_sku_id"], how="left",
            )
            sales_raw = merged[merged["_so"].isna()].drop(columns=["_so"])
            masked_rows = before - len(sales_raw)

    return sales_raw, bi_box_weekly, masked_rows


# ────────────────────────────────────────────
# 메인 빌드
# ────────────────────────────────────────────
def build_local_weekly_df(
    client,
    *,
    apply_stockout_mask: bool = True,
    include_bi_box_features: bool = True,
    save_csv: bool = True,
) -> tuple[pd.DataFrame, dict]:
    """
    로컬 모드 weekly_df 빌드.

    1. daily_performance (Supabase) → 34 SKU 판매
    2. ASOS API or CSV 캐시 → 날씨
    3. 바이박스 CSV → 품절 마스킹 + price/점유율 피처
    4. merge → weekly_df
    """
    print("=== 로컬 모드 weekly_df 빌드 시작 ===")

    # 판매
    print("[1/4] daily_performance 조회...")
    sales_raw = _fetch_daily_performance(client, WARMER_SKUS)
    print(f"  {len(sales_raw)}행")

    # 날씨 (Supabase v_weather_hybrid 우선, CSV fallback)
    print("[2/4] 날씨 로드...")
    weather_raw = _fetch_or_load_asos(client=client)

    # 바이박스 + 마스킹
    print("[3/4] 바이박스 + 품절 마스킹...")
    bi_box_weekly = pd.DataFrame()
    masked_rows = 0
    if apply_stockout_mask or include_bi_box_features:
        sales_raw, bi_box_weekly, masked_rows = _load_bi_box_and_mask(
            sales_raw, WARMER_SKUS, apply_mask=apply_stockout_mask, client=client,
        )
    print(f"  품절 마스킹: {masked_rows}행 제거")

    # 집계
    print("[4/4] 주단위 집계 + 병합...")
    sales_weekly = _aggregate_weekly_sales(sales_raw)
    weather_weekly = _aggregate_weekly_weather(weather_raw)
    merged = sales_weekly.merge(weather_weekly, on="week_start", how="left")

    if include_bi_box_features and not bi_box_weekly.empty:
        merged = merged.merge(
            bi_box_weekly.rename(columns={"coupang_sku_id": "sku"}),
            on=["week_start", "sku"],
            how="left",
        )

    diag = {
        "sales_rows_raw": len(sales_raw) + masked_rows,
        "stockout_masked_rows": masked_rows,
        "sales_weekly_rows": len(sales_weekly),
        "weather_rows": len(weather_raw),
        "bi_box_weekly_rows": len(bi_box_weekly),
        "merged_rows": len(merged),
        "skus": int(merged["sku"].nunique()) if not merged.empty else 0,
        "weeks": int(merged["week_start"].nunique()) if not merged.empty else 0,
        "period": (
            f"{merged['week_start'].min().date()} ~ {merged['week_start'].max().date()}"
            if not merged.empty else "empty"
        ),
    }

    if save_csv and not merged.empty:
        _ensure_processed_dir()
        out = PROCESSED_DIR / "weekly_feature_table.csv"
        merged.to_csv(out, index=False)
        diag["saved_to"] = str(out)
        print(f"  저장: {out}")

    print("=== 빌드 완료 ===")
    return merged, diag
