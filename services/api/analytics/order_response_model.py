"""
Model B — 쿠팡 발주 반응 모델.

입력:
- Model A 주간 판매 예측(또는 실적) — 34 SKU 합산 → 카테고리 총 판매량
- 납품률 히스토리 — 주차별 카테고리 발주요청/확정/입고

출력:
- 카테고리 수준 주차별 예상 발주 요청량
- SKU 분배: 직전 4주 판매 비율 기반

접근:
- 49주 데이터로 ML은 과적합 위험 → 2가지 병행:
  1. 비율 모델: 예상판매 × (최근 N주 발주/판매 비율) × 안전계수
  2. 선형 회귀: 판매량 + 판매 증가율 + 시즌 → 발주 요청량

2단 예측 흐름 (workflow_check.md 기준):
  날씨 → Model A(판매 예측) → Model B(발주 반응 추정) → 발주 대응 권장
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error


@dataclass
class ModelBConfig:
    # 비율 모델에서 최근 N주 사용 [근거 D] model_b_tuning.py 결과: 4주 MAE 5,477 최저
    ratio_lookback_weeks: int = 4
    # 안전계수 (1.0 = 그대로, 1.1 = 10% 여유)
    safety_factor: float = 1.0
    # SKU 분배 시 직전 N주 판매 비율 사용 [근거 D] tuning: 2주 MAE 180 최저
    sku_distribute_weeks: int = 2


# ────────────────────────────────────────────
# 판매 × 납품률 매칭
# ────────────────────────────────────────────
def build_model_b_training_data(
    weekly_sales_df: pd.DataFrame,
    delivery_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    34 SKU 주차별 합산 판매량 + 납품률 발주요청량 매칭.

    Args:
        weekly_sales_df: weekly_feature_table (sku × week_start, weekly_sales_qty 포함)
        delivery_df: load_hotpack_delivery() 결과

    Returns:
        DataFrame: week_start, total_sales, sales_lag_1, sales_growth_4w,
                   units_requested, season_flag, month
    """
    # SKU 합산 → 카테고리 주간 총 판매
    cat_sales = (
        weekly_sales_df.groupby("week_start", as_index=False)
        .agg(total_sales=("weekly_sales_qty", "sum"))
    )
    cat_sales = cat_sales.sort_values("week_start").reset_index(drop=True)

    # lag + 증가율 피처
    cat_sales["sales_lag_1"] = cat_sales["total_sales"].shift(1)
    cat_sales["sales_lag_4"] = cat_sales["total_sales"].shift(4)
    avg_4w = cat_sales["total_sales"].rolling(4).mean()
    cat_sales["sales_growth_4w"] = (cat_sales["total_sales"] - avg_4w) / avg_4w.replace(0, np.nan)

    # 시즌·달력 피처
    cat_sales["month"] = cat_sales["week_start"].dt.month
    cat_sales["season_flag"] = cat_sales["month"].apply(
        lambda m: 1 if m in (10, 11, 12, 1, 2) else 0
    )

    # 납품률 조인
    delivery_slim = delivery_df[["week_start", "units_requested", "fill_rate", "confirm_rate"]].copy()
    merged = cat_sales.merge(delivery_slim, on="week_start", how="inner")

    return merged.dropna(subset=["total_sales", "units_requested", "sales_lag_1"]).reset_index(drop=True)


# ────────────────────────────────────────────
# 비율 모델 (Ratio-based)
# ────────────────────────────────────────────
def ratio_model_predict(
    training_data: pd.DataFrame,
    future_sales: pd.Series,
    cfg: ModelBConfig | None = None,
) -> pd.Series:
    """
    예상발주 = 예상판매 × (최근 N주 발주/판매 비율) × 안전계수.

    Args:
        training_data: build_model_b_training_data 결과
        future_sales: 미래 주차별 카테고리 총 판매 예측값 Series
        cfg: 설정
    """
    cfg = cfg or ModelBConfig()
    recent = training_data.tail(cfg.ratio_lookback_weeks)
    total_req = recent["units_requested"].sum()
    total_sale = recent["total_sales"].replace(0, np.nan).sum()

    if pd.isna(total_sale) or total_sale == 0:
        ratio = 1.0
    else:
        ratio = total_req / total_sale

    return (future_sales * ratio * cfg.safety_factor).round(0).astype(int)


# ────────────────────────────────────────────
# 선형 회귀 모델
# ────────────────────────────────────────────
FEATURE_COLS_B = ["total_sales", "sales_lag_1", "sales_growth_4w", "season_flag", "month"]


def train_linear_model_b(
    training_data: pd.DataFrame,
) -> tuple[LinearRegression, float, list[str]]:
    """
    선형 회귀로 total_sales → units_requested 관계 학습.

    Returns:
        (model, mae, feature_cols)
    """
    df = training_data.dropna(subset=FEATURE_COLS_B + ["units_requested"]).copy()
    X = df[FEATURE_COLS_B].values.astype(float)
    y = df["units_requested"].values.astype(float)

    model = LinearRegression()
    model.fit(X, y)
    pred = model.predict(X)
    mae = float(mean_absolute_error(y, pred))

    return model, mae, list(FEATURE_COLS_B)


def linear_model_predict(
    model: LinearRegression,
    future_features: pd.DataFrame,
) -> pd.Series:
    """선형 모델로 미래 발주 예측."""
    X = future_features[FEATURE_COLS_B].values.astype(float)
    pred = model.predict(X)
    return pd.Series(np.maximum(0, pred).round(0).astype(int))


# ────────────────────────────────────────────
# SKU 분배
# ────────────────────────────────────────────
def distribute_to_skus(
    category_forecast: pd.DataFrame,
    weekly_sales_df: pd.DataFrame,
    cfg: ModelBConfig | None = None,
) -> pd.DataFrame:
    """
    카테고리 예측 발주량을 SKU별로 분배.

    직전 N주 판매 비율 기반: SKU의 최근 판매 비중이 곧 발주 배분 비율.

    Args:
        category_forecast: week_start, predicted_order_qty (카테고리 수준)
        weekly_sales_df: sku × week_start × weekly_sales_qty (과거 실적)
        cfg: 설정

    Returns:
        DataFrame: week_start, sku, predicted_order_qty (SKU 수준)
    """
    cfg = cfg or ModelBConfig()

    last_week = weekly_sales_df["week_start"].max()
    cutoff = last_week - pd.Timedelta(weeks=cfg.sku_distribute_weeks)
    recent = weekly_sales_df[weekly_sales_df["week_start"] > cutoff]

    sku_totals = recent.groupby("sku")["weekly_sales_qty"].sum()
    total = sku_totals.sum()
    if total == 0:
        sku_ratios = sku_totals * 0 + 1.0 / len(sku_totals) if len(sku_totals) else sku_totals
    else:
        sku_ratios = sku_totals / total

    rows = []
    for _, row in category_forecast.iterrows():
        cat_qty = row["predicted_order_qty"]
        for sku, ratio in sku_ratios.items():
            rows.append({
                "week_start": row["week_start"],
                "sku": sku,
                "predicted_order_qty": int(round(cat_qty * ratio)),
                "sku_ratio": round(float(ratio), 4),
            })
    return pd.DataFrame(rows)


# ────────────────────────────────────────────
# 전체 파이프라인
# ────────────────────────────────────────────
def run_model_b_pipeline(
    weekly_sales_df: pd.DataFrame,
    delivery_df: pd.DataFrame,
    model_a_forecast_df: pd.DataFrame,
    cfg: ModelBConfig | None = None,
) -> dict[str, Any]:
    """
    Model B 전체 실행.

    Args:
        weekly_sales_df: 과거 주단위 판매 (weekly_feature_table)
        delivery_df: 핫팩 납품률 (load_hotpack_delivery)
        model_a_forecast_df: Model A 예측 (sku, week_start, weekly_sales_qty_forecast)
        cfg: 설정

    Returns:
        {
            "training_data": 학습용 DataFrame,
            "ratio_result": 비율 모델 카테고리 예측,
            "linear_result": 선형 모델 카테고리 예측,
            "linear_mae": 학습 MAE,
            "sku_distribution": SKU별 분배 (비율 모델 기준),
            "diagnostics": 메타 정보,
        }
    """
    cfg = cfg or ModelBConfig()

    # 학습 데이터 구축
    training_data = build_model_b_training_data(weekly_sales_df, delivery_df)

    # Model A 미래 예측 → 카테고리 합산
    future_cat = (
        model_a_forecast_df
        .groupby("week_start", as_index=False)
        .agg(total_sales=("weekly_sales_qty_forecast", "sum"))
        .sort_values("week_start")
    )
    # 미래 피처 생성
    last_train = training_data.iloc[-1] if not training_data.empty else None
    future_rows = []
    for i, (_, row) in enumerate(future_cat.iterrows()):
        sales = row["total_sales"]
        lag1 = last_train["total_sales"] if i == 0 and last_train is not None else (
            future_rows[-1]["total_sales"] if future_rows else 0
        )
        month = pd.Timestamp(row["week_start"]).month
        future_rows.append({
            "week_start": row["week_start"],
            "total_sales": sales,
            "sales_lag_1": lag1,
            "sales_growth_4w": 0.0,
            "season_flag": 1 if month in (10, 11, 12, 1, 2) else 0,
            "month": month,
        })
    future_df = pd.DataFrame(future_rows)

    # 비율 모델
    ratio_pred = ratio_model_predict(training_data, future_df["total_sales"], cfg)

    # 선형 모델
    lr_model, lr_mae, lr_cols = train_linear_model_b(training_data)
    linear_pred = linear_model_predict(lr_model, future_df) if not future_df.empty else pd.Series(dtype=int)

    # 카테고리 예측 결과
    cat_forecast = future_df[["week_start"]].copy()
    cat_forecast["pred_ratio"] = ratio_pred.values
    cat_forecast["pred_linear"] = linear_pred.values if len(linear_pred) else 0
    cat_forecast["predicted_order_qty"] = cat_forecast["pred_ratio"]

    # SKU 분배 (비율 모델 기준)
    sku_dist = distribute_to_skus(cat_forecast, weekly_sales_df, cfg)

    diagnostics = {
        "training_rows": len(training_data),
        "future_weeks": len(future_df),
        "linear_mae": lr_mae,
        "ratio_lookback": cfg.ratio_lookback_weeks,
        "recent_ratio": (
            ratio_pred.iloc[0] / future_df["total_sales"].iloc[0]
            if len(future_df) and future_df["total_sales"].iloc[0] > 0 else None
        ),
        "sku_count": sku_dist["sku"].nunique() if not sku_dist.empty else 0,
    }

    return {
        "training_data": training_data,
        "ratio_result": cat_forecast[["week_start", "pred_ratio"]],
        "linear_result": cat_forecast[["week_start", "pred_linear"]],
        "linear_mae": lr_mae,
        "sku_distribution": sku_dist,
        "diagnostics": diagnostics,
    }
