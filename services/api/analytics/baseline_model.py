"""
설명 가능한 기준선(Baseline) 판매량 모델.

요구사항: 마케팅이 없는 날 위주로 학습하는 방향(마스크 주입).
모델 형태 예시: Sales ~ avg_temp + temp_range + day_of_week + season_flag
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression


@dataclass
class BaselineModelArtifact:
    """학습 결과 보존용."""

    feature_names: list[str]
    target_name: str
    intercept: float
    coef: np.ndarray
    # TODO: 학습 기간, 필터 조건, 성능지표(R2, MAPE) 기록 여부 결정


def fit_baseline_ols(
    df: pd.DataFrame,
    *,
    feature_cols: list[str],
    target_col: str,
    train_mask: pd.Series,
) -> tuple[LinearRegression, BaselineModelArtifact]:
    """
    OLS(다변량 선형회귀)로 baseline 학습.

    Args:
        train_mask: True인 행만 학습에 사용. 요구사항상 마케팅 비가동일 위주 마스크를 호출측에서 생성.
    """
    if train_mask.dtype != bool:
        raise TypeError("train_mask는 bool Series여야 합니다.")
    sub = df.loc[train_mask].copy()
    sub = sub.dropna(subset=feature_cols + [target_col])
    if sub.empty:
        raise ValueError("TODO: 학습 가능 행이 없음 — 마스크·결측 정책 재검토")

    X = sub[feature_cols].to_numpy(dtype=float)
    y = sub[target_col].to_numpy(dtype=float)
    model = LinearRegression()
    model.fit(X, y)
    artifact = BaselineModelArtifact(
        feature_names=list(feature_cols),
        target_name=target_col,
        intercept=float(model.intercept_),
        coef=np.asarray(model.coef_, dtype=float),
    )
    return model, artifact


def predict_baseline(model: LinearRegression, df: pd.DataFrame, feature_cols: list[str]) -> pd.Series:
    """전체 기간에 대한 baseline 예측."""
    X = df[feature_cols].to_numpy(dtype=float)
    y_hat = model.predict(X)
    return pd.Series(y_hat, index=df.index, name="baseline_sales_pred")


def build_non_marketing_mask(
    df: pd.DataFrame,
    marketing_on_col: str,
    *,
    treat_na_as_off: bool = True,
) -> pd.Series:
    """
    marketing_on == 0 인 행을 학습에 사용.

    TODO: 캠페인이 있으나 marketing_on 누락된 행 처리 규칙.
    """
    s = df[marketing_on_col]
    if treat_na_as_off:
        s = s.fillna(0)
    return s.astype(float).eq(0)
