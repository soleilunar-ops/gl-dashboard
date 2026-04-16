"""
2024년 합성(더미) 판매 데이터 생성기.

목적: 쿠팡 일간성과지표가 1년치(2025-04~2026-04)밖에 없어서
      겨울 검증이 불가능한 문제 해결.
      2024년 실제 날씨(ASOS) + 도메인 규칙으로 2024년 합성 판매 생성.

입력:
  - ASOS 2024년 실제 날씨 (data/processed/asos_weather_cache.csv)
  - 지역별 판매 가중치 (data/raw/coupang/regional_trend/)
  - 실데이터 2025년의 기온-판매 관계 (학습)
  - 도메인 규칙 (첫 한파, 월별 계수, 8월 납품 시작 등)

출력:
  - data/processed/synthetic_2024_weekly.csv (합성 주단위 판매)
  - data/processed/synthetic_2024_delivery.csv (합성 납품률)

주의:
  - 합성 데이터는 실데이터가 아님. "synthetic=True" 플래그 필수.
  - 합성 데이터로 학습 보강은 OK, 합성으로 검증하면 의미 없음.
  - 프로모션, 발주 리드타임은 현재 제외 (추후 다른 팀 변수 받으면 추가).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

PROCESSED_DIR = Path("data/processed")
ASOS_CACHE = PROCESSED_DIR / "asos_weather_cache.csv"
REGIONAL_DIR = Path("data/raw/coupang/regional_trend")


# ────────────────────────────────────────────
# 설정
# ────────────────────────────────────────────
@dataclass
class SyntheticConfig:
    """합성 데이터 생성 설정."""

    # 생성 기간
    start_date: str = "2024-01-01"
    end_date: str = "2024-12-31"

    # 2024년 첫 한파/첫 눈 정보
    first_cold_wave_date: str = "2024-11-27"
    first_snow_dates: dict[str, str] = field(default_factory=lambda: {
        "seoul": "2024-11-27",
        "suwon": "2024-11-26",
        "busan": "2024-11-27",
        "daejeon": "2024-11-27",
        "gwangju": "2024-11-27",
    })

    # 지역별 판매 가중치 (지역별판매트렌드 기준)
    region_weights: dict[str, float] = field(default_factory=lambda: {
        "seoul": 0.237,
        "suwon": 0.302,   # 경기 대표
        "busan": 0.065,
        "daejeon": 0.027,
        "gwangju": 0.027,
    })

    # 납품 월별 발주/판매 비율 (실데이터 기반)
    monthly_order_ratio: dict[int, float] = field(default_factory=lambda: {
        1: 0.42, 2: 0.16, 3: 0.23, 4: 0.05,
        5: 0.32, 6: 9.08, 7: 7.81, 8: 3.26,
        9: 62.95, 10: 3.52, 11: 2.42, 12: 1.54,
    })

    # 중국 춘절 (2025년: 1/29, 2024년 추정: 2/10)
    chinese_new_year: str = "2024-02-10"

    # 8월 말 납품 시작 주차
    supply_start_week: int = 35  # ISO week ~8월 마지막 주

    # 랜덤 시드
    random_state: int = 42

    # 향후 확장 플래그 (현재 미사용, 코드 hook만)
    use_promotion_calendar: bool = False
    promotion_calendar_path: str | None = None
    use_lead_time: bool = False
    lead_time_weeks: int = 4


# ────────────────────────────────────────────
# 1. 실데이터에서 기온→판매 관계 학습
# ────────────────────────────────────────────
def _learn_temp_sales_relationship(weekly_real: pd.DataFrame) -> dict:
    """
    2025 실데이터에서 기온→판매 관계를 추출.

    방법: 주간 전체 SKU 합산 판매량 vs 가중평균기온의 선형 회귀
    → 기울기(slope), 절편(intercept), 잔차 표준편차(noise_std)
    """
    cat = weekly_real.groupby("week_start", as_index=False).agg(
        total_sales=("weekly_sales_qty", "sum"),
        temp_mean=("temp_mean", "first"),
        temp_min=("temp_min", "first"),
        temp_max=("temp_max", "first"),
        temp_range=("temp_range", "first"),
        wind_mean=("wind_mean", "first"),
        snow_cm=("snow_cm", "first"),
    )

    from sklearn.linear_model import LinearRegression

    features = ["temp_mean", "wind_mean", "temp_range", "snow_cm"]
    X = cat[features].fillna(0).values
    y = cat["total_sales"].values

    model = LinearRegression()
    model.fit(X, y)

    residuals = y - model.predict(X)
    return {
        "model": model,
        "features": features,
        "intercept": float(model.intercept_),
        "coefs": dict(zip(features, model.coef_.tolist())),
        "noise_std": float(residuals.std()),
        "y_mean": float(y.mean()),
        "y_std": float(y.std()),
    }


# ────────────────────────────────────────────
# 2. ASOS 2024 날씨 → 가중 평균 주단위
# ────────────────────────────────────────────
def _build_2024_weekly_weather(cfg: SyntheticConfig) -> pd.DataFrame:
    """ASOS 캐시에서 2024년 추출, 판매 가중 평균 → 주단위 집계."""
    asos = pd.read_csv(ASOS_CACHE, parse_dates=["date"])
    asos_2024 = asos[
        (asos["date"] >= cfg.start_date) & (asos["date"] <= cfg.end_date)
    ].copy()

    if asos_2024.empty:
        raise ValueError("ASOS 캐시에 2024년 데이터 없음")

    # 지역별 가중 평균
    weights = cfg.region_weights
    total_w = sum(weights.values())
    norm_w = {r: w / total_w for r, w in weights.items()}

    daily_rows = []
    for date, grp in asos_2024.groupby("date"):
        row = {"date": date}
        for col in ["temp_mean", "temp_min", "temp_max", "rain_mm", "wind_mean", "snow_cm"]:
            weighted = 0.0
            w_sum = 0.0
            for _, r in grp.iterrows():
                region = r["region"]
                if region in norm_w:
                    val = r[col]
                    if pd.notna(val):
                        weighted += val * norm_w[region]
                        w_sum += norm_w[region]
            row[col] = weighted / w_sum if w_sum > 0 else np.nan
        # 한파 플래그
        row["cold_wave_alert"] = row.get("temp_min", 0) <= -12
        daily_rows.append(row)

    daily = pd.DataFrame(daily_rows)
    daily["date"] = pd.to_datetime(daily["date"])
    daily["temp_range"] = daily["temp_max"] - daily["temp_min"]

    # 주단위 집계
    daily["week_start"] = daily["date"] - pd.to_timedelta(daily["date"].dt.weekday, unit="D")
    daily["week_start"] = daily["week_start"].dt.normalize()

    weekly = daily.groupby("week_start", as_index=False).agg(
        temp_mean=("temp_mean", "mean"),
        temp_min=("temp_min", "min"),
        temp_max=("temp_max", "max"),
        rain_mm=("rain_mm", "sum"),
        wind_mean=("wind_mean", "mean"),
        snow_cm=("snow_cm", "sum"),
        cold_days_7d=("cold_wave_alert", "sum"),
        temp_range=("temp_range", "mean"),
    )
    return weekly


# ────────────────────────────────────────────
# 3. 월별 계수 + 도메인 규칙
# ────────────────────────────────────────────
def _month_seasonality_factor(month: int) -> float:
    """
    월별 판매 계절 계수.

    10~12월: 성수기 (1.0 = 기준)
    1월: 하강기
    2월: 시즌 종료 진입 (춥더라도 수요 둔화)
    3~9월: 비시즌
    """
    factors = {
        1: 0.55,   # 겨울 하강기
        2: 0.10,   # 시즌 종료 — 춥더라도 수요 급감
        3: 0.03,   # 비시즌
        4: 0.01, 5: 0.005, 6: 0.003, 7: 0.003,
        8: 0.005, 9: 0.01,
        10: 0.15,  # 시즌 시작
        11: 0.60,  # 본격 성수기
        12: 1.00,  # 피크
    }
    return factors.get(month, 0.01)


def _first_cold_wave_boost(week_start: pd.Timestamp, cfg: SyntheticConfig) -> float:
    """첫 한파 주에 수요 급등 가중치. 이후 2주도 여파."""
    cold_date = pd.Timestamp(cfg.first_cold_wave_date)
    cold_week = cold_date - pd.Timedelta(days=cold_date.weekday())
    diff_weeks = (week_start - cold_week).days / 7

    if diff_weeks == 0:
        return 2.5   # 첫 한파 주: 2.5배 급등
    elif diff_weeks == 1:
        return 1.5   # 다음 주: 여파
    elif diff_weeks == 2:
        return 1.2   # 2주 뒤: 약한 여파
    return 1.0


# ────────────────────────────────────────────
# 4. 합성 판매 데이터 생성
# ────────────────────────────────────────────
def generate_synthetic_sales(
    weekly_real: pd.DataFrame,
    cfg: SyntheticConfig | None = None,
) -> pd.DataFrame:
    """
    2024년 합성 주단위 판매 데이터 생성.

    Args:
        weekly_real: 2025년 실데이터 (weekly_feature_table.csv)
        cfg: 설정

    Returns:
        DataFrame: week_start, sku, weekly_sales_qty, ..., synthetic=True
    """
    cfg = cfg or SyntheticConfig()
    rng = np.random.default_rng(cfg.random_state)

    # 실데이터에서 기온→판매 관계 학습
    rel = _learn_temp_sales_relationship(weekly_real)

    # 2024년 날씨
    weather_2024 = _build_2024_weekly_weather(cfg)

    # SKU별 판매 비율 (실데이터 기준)
    sku_totals = weekly_real.groupby("sku")["weekly_sales_qty"].sum()
    sku_ratios = sku_totals / sku_totals.sum()

    # 12월 평균 주간 판매량 (실데이터 기준 스케일링 — max가 아닌 mean 사용)
    real_dec = weekly_real[weekly_real["week_start"].dt.month == 12]
    peak_weekly_sales = real_dec.groupby("week_start")["weekly_sales_qty"].sum().mean()
    if pd.isna(peak_weekly_sales) or peak_weekly_sales == 0:
        peak_weekly_sales = 100000

    rows = []
    for _, wrow in weather_2024.iterrows():
        ws = wrow["week_start"]
        month = ws.month

        # 기온 기반 예측
        X_row = pd.DataFrame([wrow[rel["features"]].fillna(0).values], columns=rel["features"])
        base_sales = max(0, float(rel["model"].predict(X_row)[0]))

        # 월별 계절 계수 적용
        season_factor = _month_seasonality_factor(month)
        base_sales = peak_weekly_sales * season_factor

        # 기온 조정: 12월 평균기온(약 0℃)을 기준 1.0으로 설정
        # → 12월은 효과 ≈ 1.0, 더 추우면 >1.0, 더 따뜻하면 <1.0
        dec_avg_temp = 0.0  # 12월 전국 가중 평균기온 기준점
        temp_effect = max(0.3, 1.0 + (dec_avg_temp - wrow["temp_mean"]) * 0.02)

        # 풍속 조정: 체감온도
        wind_effect = 1.0 + max(0, wrow["wind_mean"] - 2.0) * 0.02

        # 일교차 조정
        range_effect = 1.0 + max(0, wrow["temp_range"] - 10) * 0.01

        # 눈 효과
        snow_effect = 1.0 + min(wrow["snow_cm"], 20) * 0.05

        # 첫 한파 충격
        cold_boost = _first_cold_wave_boost(ws, cfg)

        # 종합
        total_sales = base_sales * temp_effect * wind_effect * range_effect * snow_effect * cold_boost

        # 랜덤 노이즈 (실데이터 잔차 수준)
        noise = rng.normal(0, rel["noise_std"] * 0.3)
        total_sales = max(0, total_sales + noise)

        # SKU별 분배
        for sku, ratio in sku_ratios.items():
            sku_sales = max(0, int(round(total_sales * ratio)))
            # 비시즌 소량 SKU는 0으로
            if sku_sales < 1 and month in (4, 5, 6, 7, 8, 9):
                sku_sales = 0

            rows.append({
                "week_start": ws,
                "sku": int(sku),
                "weekly_sales_qty": sku_sales,
                "temp_mean": wrow["temp_mean"],
                "temp_min": wrow["temp_min"],
                "temp_max": wrow["temp_max"],
                "rain_mm": wrow["rain_mm"],
                "wind_mean": wrow["wind_mean"],
                "snow_cm": wrow["snow_cm"],
                "cold_days_7d": wrow["cold_days_7d"],
                "temp_range": wrow["temp_range"],
                "promotion_flag": 0,  # 향후 프로모션 캘린더 연동 시 변경
                "synthetic": True,
            })

    df = pd.DataFrame(rows)
    df["week_start"] = pd.to_datetime(df["week_start"])
    return df.sort_values(["sku", "week_start"]).reset_index(drop=True)


# ────────────────────────────────────────────
# 5. 합성 납품 데이터 생성
# ────────────────────────────────────────────
def generate_synthetic_delivery(
    synthetic_sales: pd.DataFrame,
    cfg: SyntheticConfig | None = None,
) -> pd.DataFrame:
    """
    합성 판매 → 합성 납품률 (월별 발주/판매 비율 적용).
    """
    cfg = cfg or SyntheticConfig()

    cat_sales = synthetic_sales.groupby("week_start", as_index=False).agg(
        total_sales=("weekly_sales_qty", "sum"),
    )
    cat_sales["month"] = cat_sales["week_start"].dt.month
    cat_sales["iso_week"] = cat_sales["week_start"].dt.isocalendar().week.astype(int)

    rows = []
    for _, r in cat_sales.iterrows():
        month = r["month"]
        ratio = cfg.monthly_order_ratio.get(month, 1.0)

        # 비시즌(4~8월 초)은 납품 없음. 시즌(9~3월)과 8월 말 이후는 납품 있음.
        is_offseason_no_supply = (
            month in (4, 5, 6, 7)
            or (month == 8 and r["iso_week"] < cfg.supply_start_week)
        )
        if is_offseason_no_supply:
            units_requested = 0
        else:
            units_requested = int(round(r["total_sales"] * ratio))

        rows.append({
            "week_start": r["week_start"],
            "total_sales": r["total_sales"],
            "units_requested": units_requested,
            "order_ratio": ratio,
            "synthetic": True,
        })

    return pd.DataFrame(rows)


# ────────────────────────────────────────────
# 6. 메인 실행
# ────────────────────────────────────────────
def run_synthetic_generation(
    weekly_real_path: str = "data/processed/weekly_feature_table.csv",
    cfg: SyntheticConfig | None = None,
    save: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """
    합성 데이터 생성 메인.

    Returns:
        (synthetic_sales, synthetic_delivery, diagnostics)
    """
    cfg = cfg or SyntheticConfig()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    weekly_real = pd.read_csv(weekly_real_path, parse_dates=["week_start"])

    print("[1/3] 실데이터 기온→판매 관계 학습...")
    rel = _learn_temp_sales_relationship(weekly_real)
    print(f"  기울기: {rel['coefs']}")
    print(f"  노이즈 std: {rel['noise_std']:.0f}")

    print("[2/3] 합성 판매 데이터 생성...")
    syn_sales = generate_synthetic_sales(weekly_real, cfg)
    print(f"  {len(syn_sales)}행 ({syn_sales['sku'].nunique()} SKU × {syn_sales['week_start'].nunique()}주)")

    print("[3/3] 합성 납품 데이터 생성...")
    syn_delivery = generate_synthetic_delivery(syn_sales, cfg)
    print(f"  {len(syn_delivery)}행")

    # 월별 요약
    syn_sales["month"] = syn_sales["week_start"].dt.month
    monthly = syn_sales.groupby("month")["weekly_sales_qty"].sum()

    diag = {
        "sales_rows": len(syn_sales),
        "delivery_rows": len(syn_delivery),
        "skus": int(syn_sales["sku"].nunique()),
        "weeks": int(syn_sales["week_start"].nunique()),
        "period": f"{syn_sales['week_start'].min().date()} ~ {syn_sales['week_start'].max().date()}",
        "peak_month_sales": int(monthly.max()),
        "peak_month": int(monthly.idxmax()),
        "total_annual_sales": int(monthly.sum()),
        "relationship": rel["coefs"],
    }

    if save:
        out_sales = PROCESSED_DIR / "synthetic_2024_weekly.csv"
        out_delivery = PROCESSED_DIR / "synthetic_2024_delivery.csv"
        syn_sales.to_csv(out_sales, index=False)
        syn_delivery.to_csv(out_delivery, index=False)
        diag["saved_sales"] = str(out_sales)
        diag["saved_delivery"] = str(out_delivery)

    return syn_sales, syn_delivery, diag
