"""
수요 예측 파이프라인 실행기.

단계:
1. weekly_feature_builder → weekly_df (sku × week_start 피처)
2. weekly_demand_forecast.run_baseline_pipeline → forecast_df + metrics
3. sku ↔ product_id 매핑 (products 우선, sku_mappings fallback)
4. forecasts 테이블 insert

CLI 단독 실행 및 FastAPI /forecast/run 양쪽에서 재사용 가능.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pandas as pd

from services.api.analytics.weekly_demand_forecast import (
    WeeklyForecastConfig,
    run_baseline_pipeline,
)
from services.api.data_pipeline.weekly_feature_builder import (
    WeeklyFeatureConfig,
    build_weekly_feature_table,
)

MODEL_VERSION = "v0.1-baseline"


@dataclass
class RunResult:
    status: str
    metrics: dict[str, float]
    inserted_rows: int
    skipped_skus: list[int] = field(default_factory=list)
    forecast_rows: int = 0
    period: str = ""
    message: str = ""


def _build_sku_to_product_id(client, skus: list[int]) -> tuple[dict[int, str], list[int]]:
    """
    34 SKU 각각을 UUID product_id 하나로 매핑.

    우선순위:
    1) products.coupang_sku_id == sku (대표 SKU)
    2) sku_mappings.coupang_sku_id == sku → accuracy ★★★ 우선, 없으면 첫 번째

    Returns:
        ({sku: product_id}, unmatched_skus)
    """
    skus_str = [str(s) for s in skus]

    # 1) products 직접 매핑
    pr = (
        client.table("products")
        .select("id,coupang_sku_id")
        .in_("coupang_sku_id", skus_str)
        .execute()
    )
    mapping: dict[int, str] = {}
    for row in pr.data or []:
        sku = int(row["coupang_sku_id"])
        if sku not in mapping:
            mapping[sku] = row["id"]

    # 2) 나머지는 sku_mappings fallback
    remaining = [s for s in skus if s not in mapping]
    if remaining:
        sm = (
            client.table("sku_mappings")
            .select("coupang_sku_id,product_id,accuracy")
            .in_("coupang_sku_id", [str(s) for s in remaining])
            .execute()
        )
        # accuracy ★★★ 먼저
        rows_sorted = sorted(
            sm.data or [],
            key=lambda r: (r.get("accuracy") != "★★★", r.get("accuracy") or ""),
        )
        for row in rows_sorted:
            sku = int(row["coupang_sku_id"])
            if sku not in mapping:
                mapping[sku] = row["product_id"]

    unmatched = [s for s in skus if s not in mapping]
    return mapping, unmatched


def _forecast_to_records(
    forecast_df: pd.DataFrame,
    sku_to_pid: dict[int, str],
    metrics: dict[str, float],
    training_period: str,
    *,
    model_name: str,
) -> list[dict[str, Any]]:
    """forecast_df → forecasts 테이블 insert용 레코드."""
    rows: list[dict[str, Any]] = []
    input_features = {
        "weather": True,
        "promotion_flag": True,
        "lag_weeks": [1, 2, 4],
        "stockout_masked": False,  # Step 5-a placeholder
    }

    for _, row in forecast_df.iterrows():
        sku = int(row["sku"])
        pid = sku_to_pid.get(sku)
        if pid is None:
            continue
        pred = float(row.get("weekly_sales_qty_forecast", 0))
        rows.append(
            {
                "product_id": pid,
                "forecast_date": pd.Timestamp(row["week_start"]).strftime("%Y-%m-%d"),
                "predicted_qty": int(round(max(0.0, pred))),
                "model_name": model_name,
                "confidence_lower": None,
                "confidence_upper": None,
                "confidence_level": None,
                "input_features": input_features,
                "model_version": MODEL_VERSION,
                "training_period": training_period,
            }
        )
    return rows


def run_forecast_pipeline(
    client,
    *,
    model_kind: str = "lightgbm",
    val_weeks: int = 8,
    forecast_horizon: int = 4,
    apply_stockout_mask: bool = False,
) -> RunResult:
    """
    전체 예측 파이프라인 실행 + Supabase forecasts insert.
    """
    feat_cfg = WeeklyFeatureConfig(apply_stockout_mask=apply_stockout_mask)
    weekly_df, diag = build_weekly_feature_table(client, feat_cfg)
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

    skus_present = sorted(forecast_df["sku"].astype(int).unique().tolist())
    sku_to_pid, unmatched = _build_sku_to_product_id(client, skus_present)

    training_period = diag.get("period", "")
    records = _forecast_to_records(
        forecast_df,
        sku_to_pid,
        metrics,
        training_period,
        model_name=model_kind,
    )

    # insert (upsert 불필요: forecast_date + product_id + model_name 조합으로 신규)
    inserted = 0
    if records:
        BATCH = 500
        for i in range(0, len(records), BATCH):
            batch = records[i : i + BATCH]
            res = client.table("forecasts").insert(batch).execute()
            inserted += len(res.data or [])

    return RunResult(
        status="ok",
        metrics=metrics,
        inserted_rows=inserted,
        skipped_skus=unmatched,
        forecast_rows=len(forecast_df),
        period=training_period,
        message=f"missing_exog={missing_exog}" if missing_exog else "",
    )
