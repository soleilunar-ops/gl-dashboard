"""
SKU별 주간 판매량(weekly_sales_qty) 베이스라인 예측.

LightGBM 또는 선형회귀(OLS)로 학습하고, 재귀 방식으로 향후 4주를 예측한다.
미래 기상·가격은 학습 구간 통계(iso 주차별 중앙값)와 마지막 관측 행으로 보간하거나,
별도 제공 future_exog 표로 덮어쓸 수 있다.

변경 이유: weekly_feature_table 기반 4주 선행 예측 파이프라인을 재사용 가능한 모듈로 분리
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

try:
    import lightgbm as lgb
except ImportError:  # pragma: no cover - 런타임에 선택 설치
    lgb = None

# 주차별 학습에 사용하는 기본 피처(원천 테이블에 없으면 제외됨)
DEFAULT_EXOG_COLS = [
    "temp_mean",
    "temp_min",
    "temp_max",
    "rain_mm",
    "snow_cm",
    "wind_mean",
    "cold_days_7d",
    "promotion_flag",
    "stock_flag",
    "price",
]

ModelKind = Literal["lightgbm", "linear"]


@dataclass
class WeeklyForecastConfig:
    """학습·예측 공통 설정."""

    sku_col: str = "sku"
    week_col: str = "week_start"
    target_col: str = "weekly_sales_qty"
    lag_weeks: tuple[int, ...] = (1, 2, 4)
    exog_cols: tuple[str, ...] | None = None
    forecast_horizon: int = 4
    random_state: int = 42


def _ensure_datetime_monday_week_start(s: pd.Series) -> pd.Series:
    """week_start를 datetime으로 맞추고 ISO 월요일 기준으로 정규화한다."""
    dt = pd.to_datetime(s)
    dow = dt.dt.weekday  # 월=0
    return dt - pd.to_timedelta(dow, unit="D")


def add_weekly_lag_features(
    df: pd.DataFrame,
    config: WeeklyForecastConfig,
) -> pd.DataFrame:
    """SKU별 주간 판매 lag 및 달력 피처 추가."""
    out = df.copy()
    out[config.week_col] = _ensure_datetime_monday_week_start(out[config.week_col])
    out = out.sort_values([config.sku_col, config.week_col])

    g_sales = out.groupby(config.sku_col, sort=False)[config.target_col]
    for w in config.lag_weeks:
        col = f"{config.target_col}_lag_{w}"
        out[col] = g_sales.shift(w)

    week_start = out[config.week_col]
    out["week_of_year"] = week_start.dt.isocalendar().week.astype(int)
    out["month"] = week_start.dt.month.astype(int)
    return out


def _resolve_feature_columns(df: pd.DataFrame, config: WeeklyForecastConfig) -> tuple[list[str], list[str]]:
    """lag 피처 + 데이터에 존재하는 외생 변수 목록을 확정한다."""
    lag_cols = [f"{config.target_col}_lag_{w}" for w in config.lag_weeks]
    exog = list(config.exog_cols) if config.exog_cols is not None else list(DEFAULT_EXOG_COLS)
    exog_present = [c for c in exog if c in df.columns]
    missing_exog = [c for c in exog if c not in df.columns]
    feature_cols = lag_cols + exog_present
    return feature_cols, missing_exog


def prepare_training_matrix(
    df: pd.DataFrame,
    config: WeeklyForecastConfig | None = None,
) -> tuple[pd.DataFrame, list[str], list[str]]:
    """
    학습 가능한 행만 남기고 피처 열 이름을 반환한다.

    Returns:
        (피처가 채워진 DataFrame, feature_cols, 누락된 정의 외생변수 목록)
    """
    cfg = config or WeeklyForecastConfig()
    enriched = add_weekly_lag_features(df, cfg)
    feature_cols, missing_exog = _resolve_feature_columns(enriched, cfg)
    lag_cols = [f"{cfg.target_col}_lag_{w}" for w in cfg.lag_weeks]
    dropna_subset = lag_cols + [cfg.target_col]
    out = enriched.dropna(subset=dropna_subset)
    if feature_cols:
        out = out.dropna(subset=[c for c in feature_cols if c in out.columns])
    return out, feature_cols, missing_exog


def time_based_train_val_split(
    df: pd.DataFrame,
    config: WeeklyForecastConfig,
    *,
    val_weeks: int = 8,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """가장 최근 val_weeks 주 구간을 검증으로 분리(글로벌 week_start 기준)."""
    cfg = config
    if df.empty:
        return df, df
    cutoff = df[cfg.week_col].max() - pd.Timedelta(weeks=val_weeks)
    train = df[df[cfg.week_col] <= cutoff]
    val = df[df[cfg.week_col] > cutoff]
    return train, val


def train_linear_model(
    train_df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
) -> LinearRegression:
    """다변량 선형회귀(OLS) 베이스라인."""
    X = train_df[feature_cols].to_numpy(dtype=float)
    y = train_df[target_col].to_numpy(dtype=float)
    model = LinearRegression()
    model.fit(X, y)
    return model


def train_lightgbm_model(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    *,
    random_state: int = 42,
) -> Any:
    """LightGBM 회귀. 검증이 비면 고정 라운드로 학습한다."""
    if lgb is None:
        raise ImportError("lightgbm 패키지가 필요합니다. pip install lightgbm")

    X_tr = train_df[feature_cols]
    y_tr = train_df[target_col]
    params: dict[str, Any] = {
        "objective": "regression",
        "metric": "mae",
        "verbosity": -1,
        "seed": random_state,
        "learning_rate": 0.05,
        "num_leaves": 31,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
    }
    train_set = lgb.Dataset(X_tr, label=y_tr)
    if not val_df.empty:
        valid_set = lgb.Dataset(val_df[feature_cols], label=val_df[target_col], reference=train_set)
        booster = lgb.train(
            params,
            train_set,
            num_boost_round=500,
            valid_sets=[train_set, valid_set],
            valid_names=["train", "valid"],
            callbacks=[lgb.early_stopping(50, verbose=False)],
        )
    else:
        booster = lgb.train(
            params,
            train_set,
            num_boost_round=200,
            valid_sets=[train_set],
            valid_names=["train"],
        )
    return booster


def _mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(mean_absolute_error(y_true, y_pred))


def _predict_matrix(model: Any, X: np.ndarray, *, kind: ModelKind) -> np.ndarray:
    """행렬 단위 예측."""
    if kind == "linear":
        return model.predict(X)
    ni = getattr(model, "best_iteration", None)
    if lgb is not None and ni is not None:
        return model.predict(X, num_iteration=ni)
    return model.predict(X)


def _predict_one_row(model: Any, model_kind: ModelKind, X: np.ndarray) -> float:
    """단일 행 예측."""
    return float(_predict_matrix(model, X, kind=model_kind)[0])


def evaluate_regression(
    model: Any,
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str,
    *,
    kind: ModelKind,
) -> float:
    """검증 구간 MAE."""
    if df.empty:
        return float("nan")
    X = df[feature_cols].to_numpy(dtype=float)
    pred = _predict_matrix(model, X, kind=kind)
    return _mae(df[target_col].to_numpy(dtype=float), pred)


def _median_exog_by_iso_week(
    train_df: pd.DataFrame,
    week_col: str,
    exog_cols: list[str],
) -> pd.DataFrame:
    """학습 구간에서 iso week 단위 외생변수 중앙값."""
    if not exog_cols:
        return pd.DataFrame()
    t = train_df.copy()
    t["_iso_week"] = t[week_col].dt.isocalendar().week.astype(int)
    return t.groupby("_iso_week", as_index=False)[exog_cols].median()


def _next_n_week_starts(last_week_start: pd.Timestamp, n: int) -> list[pd.Timestamp]:
    """ISO 월요일 기준으로 이어지는 n개 week_start."""
    out: list[pd.Timestamp] = []
    cur = pd.Timestamp(last_week_start) + pd.Timedelta(weeks=1)
    cur = _ensure_datetime_monday_week_start(pd.Series([cur]))[0]
    for _ in range(n):
        out.append(cur)
        cur = cur + pd.Timedelta(weeks=1)
    return out


def forecast_next_4_weeks(
    weekly_df: pd.DataFrame,
    *,
    model: Any,
    feature_cols: list[str],
    target_col: str,
    model_kind: ModelKind,
    config: WeeklyForecastConfig | None = None,
    future_exog: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    각 SKU에 대해 데이터상 마지막 주 이후 N주(기본 4)를 재귀적으로 예측한다.

    future_exog:
        (선택) sku, week_start 및 외생 컬럼. 없으면 iso 주차 중앙값 + 마지막 관측 행 보간.
    """
    cfg = config or WeeklyForecastConfig()
    hist_df = weekly_df.copy()
    hist_df[cfg.week_col] = _ensure_datetime_monday_week_start(hist_df[cfg.week_col])
    hist_df = hist_df.sort_values([cfg.sku_col, cfg.week_col])

    skus = hist_df[cfg.sku_col].unique()
    lag_prefix = f"{target_col}_lag_"
    exog_cols = [c for c in feature_cols if not c.startswith(lag_prefix)]
    median_by_iso = _median_exog_by_iso_week(hist_df, cfg.week_col, exog_cols)
    iso_key = "_iso_week"

    rows: list[dict[str, Any]] = []

    for sku in skus:
        sku_hist = (
            hist_df.loc[hist_df[cfg.sku_col] == sku]
            .sort_values(cfg.week_col)
            .reset_index(drop=True)
        )
        if sku_hist.empty:
            continue
        last_row = sku_hist.iloc[-1]
        sales_hist: list[float] = sku_hist[target_col].astype(float).tolist()
        if len(sales_hist) < max(cfg.lag_weeks):
            continue

        future_starts = _next_n_week_starts(last_row[cfg.week_col], cfg.forecast_horizon)

        for h_idx, ws in enumerate(future_starts, start=1):
            feat: dict[str, Any] = {cfg.sku_col: sku, cfg.week_col: ws, "horizon": h_idx}
            iso_w = int(pd.Timestamp(ws).isocalendar().week)

            for w in cfg.lag_weeks:
                feat[f"{target_col}_lag_{w}"] = sales_hist[-w] if len(sales_hist) >= w else np.nan

            if future_exog is not None:
                sub = future_exog
                ws_ts = pd.Timestamp(ws)
                if cfg.sku_col in sub.columns:
                    m = sub[(sub[cfg.sku_col] == sku) & (pd.to_datetime(sub[cfg.week_col]) == ws_ts)]
                else:
                    m = sub[pd.to_datetime(sub[cfg.week_col]) == ws_ts]
                if len(m):
                    ex = m.iloc[0]
                    for c in exog_cols:
                        feat[c] = ex[c] if c in ex.columns else last_row.get(c, np.nan)
                else:
                    for c in exog_cols:
                        feat[c] = last_row.get(c, np.nan)
            else:
                iso_row = (
                    median_by_iso.loc[median_by_iso[iso_key] == iso_w]
                    if iso_key in median_by_iso.columns and not median_by_iso.empty
                    else pd.DataFrame()
                )
                for c in exog_cols:
                    if not iso_row.empty and c in iso_row.columns:
                        val = float(iso_row.iloc[0][c])
                    else:
                        val = last_row.get(c, np.nan)
                    feat[c] = val

            X = pd.DataFrame([feat])[feature_cols].to_numpy(dtype=float)
            y_hat = _predict_one_row(model, model_kind, X)
            feat[f"{target_col}_forecast"] = max(0.0, y_hat)
            rows.append(feat)
            sales_hist.append(feat[f"{target_col}_forecast"])

    return pd.DataFrame(rows)


def run_baseline_pipeline(
    weekly_df: pd.DataFrame,
    *,
    model_kind: ModelKind = "lightgbm",
    val_weeks: int = 8,
    config: WeeklyForecastConfig | None = None,
    future_exog: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, Any, list[str], dict[str, float], list[str]]:
    """
    전처리 → 학습 → 검증 MAE → 4주 예측까지 한 번에 실행한다.

    future_exog:
        (선택) 미래 주차별 외생변수(ECMWF 집계 등). 컬럼은 forecast_next_4_weeks 설명과 동일.

    Returns:
        (forecast_df, model, feature_cols, metrics, missing_exog_cols)
    """
    cfg = config or WeeklyForecastConfig()
    trainable, feature_cols, missing_exog = prepare_training_matrix(weekly_df, cfg)

    metrics: dict[str, float] = {}
    train_df, val_df = time_based_train_val_split(trainable, cfg, val_weeks=val_weeks)

    if model_kind == "linear":
        model = train_linear_model(train_df, feature_cols, cfg.target_col)
        metrics["train_mae"] = evaluate_regression(model, train_df, feature_cols, cfg.target_col, kind="linear")
        metrics["val_mae"] = evaluate_regression(model, val_df, feature_cols, cfg.target_col, kind="linear")
    else:
        model = train_lightgbm_model(
            train_df,
            val_df,
            feature_cols,
            cfg.target_col,
            random_state=cfg.random_state,
        )
        metrics["train_mae"] = evaluate_regression(model, train_df, feature_cols, cfg.target_col, kind="lightgbm")
        metrics["val_mae"] = evaluate_regression(model, val_df, feature_cols, cfg.target_col, kind="lightgbm")

    forecast_df = forecast_next_4_weeks(
        weekly_df,
        model=model,
        feature_cols=feature_cols,
        target_col=cfg.target_col,
        model_kind=model_kind,
        config=cfg,
        future_exog=future_exog,
    )

    return forecast_df, model, feature_cols, metrics, missing_exog
