"""
수요 예측 파이프라인 실행기 (PM v2 스키마 기준).

단계:
1. local_feature_builder.build_local_weekly_df → weekly_df
   (daily_performance + v_weather_hybrid + bi_box_daily, CSV fallback)
2. weekly_demand_forecast.run_baseline_pipeline → forecast_df + metrics
3. forecast_model_a UPSERT (supabase_uploader)

legacy forecasts/products/sku_mappings 테이블은 PM v2 재구축으로 없어져서
이 실행기는 해당 경로를 사용하지 않는다. 결과는 forecast_model_a에만 기록.

CLI 단독 실행 및 FastAPI /forecast/run 양쪽에서 재사용 가능.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from services.api.analytics.weekly_demand_forecast import (
    WeeklyForecastConfig,
    run_baseline_pipeline,
)
from services.api.data_pipeline.local_feature_builder import build_local_weekly_df


@dataclass
class RunResult:
    status: str
    metrics: dict[str, float]
    inserted_rows: int
    skipped_skus: list[int] = field(default_factory=list)
    forecast_rows: int = 0
    period: str = ""
    message: str = ""


def run_forecast_pipeline(
    client,
    *,
    model_kind: str = "lightgbm",
    val_weeks: int = 8,
    forecast_horizon: int = 4,
    apply_stockout_mask: bool = False,
    save_to_forecast_model_a: bool = True,
    model_version: str = "round4",
    used_synthetic: bool = False,
) -> RunResult:
    """
    전체 예측 파이프라인 실행 + Supabase forecast_model_a UPSERT.
    """
    weekly_df, diag = build_local_weekly_df(
        client,
        apply_stockout_mask=apply_stockout_mask,
        include_bi_box_features=True,
        save_csv=False,
    )
    if weekly_df.empty:
        return RunResult(
            status="empty_features",
            metrics={},
            inserted_rows=0,
            message=diag.get("warning", "weekly_df 생성 실패"),
        )

    fc_cfg = WeeklyForecastConfig(forecast_horizon=forecast_horizon)
    forecast_df, model, feature_cols, metrics, missing_exog = run_baseline_pipeline(
        weekly_df,
        model_kind=model_kind,
        val_weeks=val_weeks,
        config=fc_cfg,
    )
    if forecast_df.empty:
        return RunResult(
            status="empty_forecast",
            metrics=metrics,
            inserted_rows=0,
            message="학습 후 예측 행이 비었음 (SKU별 학습 데이터 부족 가능)",
        )

    training_period = diag.get("period", "")

    fma_rows = 0
    if save_to_forecast_model_a:
        try:
            from services.api.data_pipeline.supabase_uploader import save_forecast_model_a
            today = pd.Timestamp.today().normalize()
            future_fc = forecast_df[forecast_df["week_start"] >= today]
            fma_rows = save_forecast_model_a(
                client,
                future_fc,
                model_version=model_version,
                used_synthetic=used_synthetic,
                features_used=list(feature_cols) if feature_cols is not None else None,
                val_mae=metrics.get("val_mae"),
            )
        except Exception as ex:
            print(f"  forecast_model_a 저장 실패(무시): {ex}")

    return RunResult(
        status="ok",
        metrics=metrics,
        inserted_rows=fma_rows,
        skipped_skus=[],
        forecast_rows=len(forecast_df),
        period=training_period,
        message=(
            (f"missing_exog={missing_exog}; " if missing_exog else "")
            + f"forecast_model_a={fma_rows}"
        ),
    )
