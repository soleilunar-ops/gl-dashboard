"""
마케팅 효과 분해: Actual vs Baseline 예측.

Weather lift와의 이중계상 방지: baseline에 날씨·시즌·요일이 들어가므로
Marketing Lift는 '잔차' 해석에 가깝다. TODO: 이론적 가정 문서화(교란변수, 동시 프로모).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class MarketingEffectConfig:
    """집계 단위(일×SKU) 고정."""

    spend_col: str = "spend"
    actual_col: str = "sales"
    baseline_pred_col: str = "baseline_sales_pred"


def compute_marketing_lift_table(df: pd.DataFrame, cfg: MarketingEffectConfig) -> pd.DataFrame:
    """
    Marketing Lift = Actual - Baseline_pred.

    추가 지표:
        lift_pct: TODO: 분모(actual 또는 baseline) 확정
        lift_per_spend: lift / spend (spend==0 처리 TODO)
        incremental_roas: TODO: 증분 매출 정의(쿠팡 orders_from_ad vs 총 sales) 확정 후 계산
    """
    need = [cfg.actual_col, cfg.baseline_pred_col]
    missing = [c for c in need if c not in df.columns]
    if missing:
        raise KeyError(f"TODO: 필수 컬럼 없음: {missing}")

    out = df.copy()
    out["marketing_lift"] = out[cfg.actual_col] - out[cfg.baseline_pred_col]
    # TODO: lift_pct 분모 결정 후 활성화
    out["lift_pct"] = pd.NA
    if cfg.spend_col in out.columns:
        # TODO: spend==0, 쿠폰만 있는 경우 등 예외처리 규칙
        out["lift_per_spend"] = out["marketing_lift"] / out[cfg.spend_col].replace({0: pd.NA})
    else:
        out["lift_per_spend"] = pd.NA
    out["incremental_roas"] = pd.NA  # TODO: spend·증분매출 정의 확정 후 산출
    return out


def attach_weather_lift_residual(
    df: pd.DataFrame,
    *,
    actual_col: str,
    baseline_pred_col: str,
    out_col: str = "weather_market_residual",
) -> pd.DataFrame:
    """
    날씨·시즌·요일을 baseline에 포함한 경우, 잔차는 '마케팅+기타' 혼합.

    TODO: 날씨 효과를 별도 항으로 분리하려면 2단계 모델/교란통제 전략 설계 필요.
    """
    out = df.copy()
    out[out_col] = out[actual_col] - out[baseline_pred_col]
    return out
