"""
주단위 피처 테이블 빌더.

입력:
- Supabase coupang_performance (일자 × SKU 단위 판매 지표)
- Supabase weather_data (일자 × 지역 단위 날씨 지표)

출력:
- weekly_df: week_start × coupang_sku_id 단위 학습용 테이블
    sku, week_start, weekly_sales_qty, weekly_gmv, weekly_promo_units,
    avg_asp, avg_conversion_rate, weekly_page_views, promotion_flag,
    temp_mean, temp_min, temp_max, rain_mm, snow_cm, cold_days

Step 5(모델 학습/추론)에서 이 테이블을 그대로 weekly_demand_forecast.run_baseline_pipeline 에 투입.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

# 핫팩 34개 SKU (사용자 제공 리스트 — 보온소품 카테고리 내 운영 대상)
WARMER_SKUS: tuple[int, ...] = (
    66805009, 63575566, 63448701, 63407190, 63216406, 63066151, 62936075,
    55872727, 51745713, 50831847, 50117045, 49540284, 49118115, 40924062,
    40851591, 39808552, 38792460, 38696876, 38679042, 38548865, 34483110,
    34479452, 28476643, 28476250, 28455663, 28453740, 28453721, 28433916,
    10657274, 10642412, 9435691, 2328921, 2298273, 41856,
)


@dataclass
class WeeklyFeatureConfig:
    """주단위 피처 빌드 설정."""

    category_l3: str = "보온소품"
    skus: tuple[int, ...] = WARMER_SKUS
    # 날씨 집계 기준: national_avg(5지점 평균) 또는 seoul(서울만)
    weather_mode: str = "national_avg"
    # ASOS만 과거 데이터, forecast 포함 여부
    include_forecast_weather: bool = False
    # 페이지 단위 조회 크기 (Supabase 기본 1000)
    page_size: int = 1000
    # Supabase 'source' 필드로 ASOS/예보 구분
    asos_source: str = "asos"
    forecast_source: str = "ecmwf_open_meteo"
    # 품절 마스킹 — 기본 off. 데이터 커버리지 확인 후 켜기
    apply_stockout_mask: bool = False
    # 품절 소스: "logistics" (coupang_logistics.is_stockout), "bi_box" (바이박스 CSV), "both" (둘 다)
    stockout_source: str = "bi_box"
    # bi_box 디렉토리 경로
    bi_box_dir: str = "data/raw/coupang/bi_box"
    # bi_box 피처를 weekly_df에 추가할지 (price, bi_box_share)
    include_bi_box_features: bool = True


# ────────────────────────────────────────────
# 판매 집계
# ────────────────────────────────────────────
def _fetch_coupang_performance(
    client,
    cfg: WeeklyFeatureConfig,
) -> pd.DataFrame:
    """coupang_performance 전체 조회 (페이지네이션). 보온소품 + 34 SKU만."""
    rows: list[dict] = []
    offset = 0
    while True:
        query = (
            client.table("coupang_performance")
            .select(
                "date,coupang_sku_id,units_sold,gmv,promo_units,asp,"
                "conversion_rate,page_views,return_units"
            )
            .eq("category_l3", cfg.category_l3)
            .in_("coupang_sku_id", list(cfg.skus))
            .order("date")
            .range(offset, offset + cfg.page_size - 1)
        )
        res = query.execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < cfg.page_size:
            break
        offset += cfg.page_size
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    return df


def _aggregate_weekly_sales(df: pd.DataFrame, sku_col: str = "coupang_sku_id") -> pd.DataFrame:
    """일자×SKU → 주차×SKU 집계."""
    if df.empty:
        return df

    # ISO 월요일 기준 week_start
    df = df.copy()
    df["week_start"] = df["date"] - pd.to_timedelta(df["date"].dt.weekday, unit="D")
    df["week_start"] = df["week_start"].dt.normalize()

    agg = df.groupby(["week_start", sku_col], as_index=False).agg(
        weekly_sales_qty=("units_sold", "sum"),
        weekly_return_qty=("return_units", "sum"),
        weekly_gmv=("gmv", "sum"),
        weekly_promo_units=("promo_units", "sum"),
        weekly_page_views=("page_views", "sum"),
        avg_asp=("asp", "mean"),
        avg_conversion_rate=("conversion_rate", "mean"),
        days_observed=("date", "nunique"),
    )
    agg["promotion_flag"] = (agg["weekly_promo_units"] > 0).astype(int)
    # 이름 표준화 (weekly_demand_forecast 호환)
    agg = agg.rename(columns={sku_col: "sku"})
    return agg.sort_values(["sku", "week_start"]).reset_index(drop=True)


# ────────────────────────────────────────────
# 날씨 집계
# ────────────────────────────────────────────
def _fetch_weather(client, cfg: WeeklyFeatureConfig) -> pd.DataFrame:
    """weather_data 전체 조회 (page size 1000 기준 페이지네이션)."""
    sources = [cfg.asos_source]
    if cfg.include_forecast_weather:
        sources.append(cfg.forecast_source)

    rows: list[dict] = []
    offset = 0
    while True:
        query = (
            client.table("weather_data")
            .select("date,region,temp_min,temp_max,temp_avg,precipitation,snow_depth,cold_wave_alert,source")
            .in_("source", sources)
            .order("date")
            .range(offset, offset + cfg.page_size - 1)
        )
        res = query.execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < cfg.page_size:
            break
        offset += cfg.page_size

    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    if cfg.weather_mode == "seoul":
        df = df[df["region"] == "seoul"].copy()
    return df


def _aggregate_weekly_weather(df: pd.DataFrame) -> pd.DataFrame:
    """일자×지역 → 주차 단일 시리즈 (5지점 평균 또는 단일 지역)."""
    if df.empty:
        return df

    # 먼저 일자 단위로 지역 평균(national_avg 모드)
    daily = df.groupby("date", as_index=False).agg(
        temp_min=("temp_min", "min"),        # 전국 일 최저
        temp_max=("temp_max", "max"),        # 전국 일 최고
        temp_mean=("temp_avg", "mean"),      # 평균
        rain_mm=("precipitation", "sum"),    # 강수 합계(지역 합)
        snow_cm=("snow_depth", "sum"),
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
        cold_days_7d=("cold_wave_alert", "sum"),
    )
    # 일교차
    weekly["temp_range"] = weekly["temp_max"] - weekly["temp_min"]
    return weekly


# ────────────────────────────────────────────
# 품절 마스킹 (placeholder — 데이터 커버리지 확장 후 활성화)
# ────────────────────────────────────────────
def _fetch_stockout_days(client, cfg: WeeklyFeatureConfig) -> pd.DataFrame:
    """coupang_logistics.is_stockout=True 인 (date, coupang_sku_id) 목록 조회."""
    rows: list[dict] = []
    offset = 0
    while True:
        query = (
            client.table("coupang_logistics")
            .select("date,coupang_sku_id,is_stockout")
            .eq("is_stockout", True)
            .in_("coupang_sku_id", list(cfg.skus))
            .order("date")
            .range(offset, offset + cfg.page_size - 1)
        )
        res = query.execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < cfg.page_size:
            break
        offset += cfg.page_size
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    return df


def _apply_stockout_mask(sales_raw: pd.DataFrame, stockout_df: pd.DataFrame) -> pd.DataFrame:
    """품절일의 판매 행을 학습에서 제외 (안전 조치: left anti join)."""
    if sales_raw.empty or stockout_df.empty:
        return sales_raw
    stockout_df = stockout_df[["date", "coupang_sku_id"]].drop_duplicates()
    merged = sales_raw.merge(
        stockout_df.assign(_stockout=1),
        on=["date", "coupang_sku_id"],
        how="left",
    )
    return merged[merged["_stockout"].isna()].drop(columns=["_stockout"])


# ────────────────────────────────────────────
# 최종 빌드
# ────────────────────────────────────────────
def build_weekly_feature_table(
    client,
    cfg: WeeklyFeatureConfig | None = None,
) -> tuple[pd.DataFrame, dict]:
    """
    판매·날씨를 결합한 주단위 학습 테이블 반환.

    Returns:
        (weekly_df, diagnostics)
        weekly_df: sku × week_start 단위 DataFrame
        diagnostics: 카운트·결측 등 메타 정보
    """
    cfg = cfg or WeeklyFeatureConfig()

    sales_raw = _fetch_coupang_performance(client, cfg)
    weather_raw = _fetch_weather(client, cfg)

    # 바이박스 로드 (품절 마스킹 + 추가 피처 용)
    bi_box_weekly = pd.DataFrame()
    bi_box_daily = pd.DataFrame()
    if cfg.include_bi_box_features or (cfg.apply_stockout_mask and cfg.stockout_source in ("bi_box", "both")):
        from .bi_box_loader import load_bi_box_all, aggregate_weekly_bi_box

        bi_box_daily = load_bi_box_all(directory=cfg.bi_box_dir, skus=list(cfg.skus))
        bi_box_weekly = aggregate_weekly_bi_box(bi_box_daily)

    # 품절 마스킹
    stockout_masked_rows = 0
    if cfg.apply_stockout_mask:
        before = len(sales_raw)
        if cfg.stockout_source in ("bi_box", "both") and not bi_box_daily.empty:
            stockout_from_bibox = bi_box_daily.loc[
                bi_box_daily["is_stockout"], ["date", "coupang_sku_id"]
            ]
            sales_raw = _apply_stockout_mask(sales_raw, stockout_from_bibox)
        if cfg.stockout_source in ("logistics", "both"):
            stockout_from_logistics = _fetch_stockout_days(client, cfg)
            sales_raw = _apply_stockout_mask(sales_raw, stockout_from_logistics)
        stockout_masked_rows = before - len(sales_raw)

    sales_weekly = _aggregate_weekly_sales(sales_raw)
    weather_weekly = _aggregate_weekly_weather(weather_raw)

    if sales_weekly.empty:
        return sales_weekly, {
            "sales_rows": 0,
            "weather_rows": len(weather_raw),
            "weekly_rows": 0,
            "warning": "coupang_performance 보온소품 × 34 SKU 결과 없음",
        }

    merged = sales_weekly.merge(weather_weekly, on="week_start", how="left")

    # 바이박스 피처 병합 (price, bi_box_share, stockout_days)
    if cfg.include_bi_box_features and not bi_box_weekly.empty:
        merged = merged.merge(
            bi_box_weekly.rename(columns={"coupang_sku_id": "sku"}),
            on=["week_start", "sku"],
            how="left",
        )

    diagnostics = {
        "sales_rows": len(sales_raw),
        "weather_rows": len(weather_raw),
        "sales_weekly_rows": len(sales_weekly),
        "weather_weekly_rows": len(weather_weekly),
        "merged_rows": len(merged),
        "skus": int(merged["sku"].nunique()),
        "weeks": int(merged["week_start"].nunique()),
        "weather_null_weeks": int(merged["temp_mean"].isna().sum()),
        "stockout_masked_rows": stockout_masked_rows,
        "stockout_mask_applied": cfg.apply_stockout_mask,
        "stockout_source": cfg.stockout_source,
        "bi_box_daily_rows": len(bi_box_daily),
        "bi_box_weekly_rows": len(bi_box_weekly),
        "period": (
            f"{merged['week_start'].min().date()} ~ {merged['week_start'].max().date()}"
            if len(merged)
            else "empty"
        ),
    }
    return merged, diagnostics
