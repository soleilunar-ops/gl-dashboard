"""
전체 수요예측 파이프라인 통합 실행 CLI.

사용:
    python services/api/run_pipeline.py

단계:
    1. weekly_df 빌드 (daily_performance + ASOS + bi_box)
    2. Model A 학습 + 4주 예측 → CSV 저장
    3. Model B 발주 반응 추정 → CSV 저장
    4. OpenAI 인사이트 생성 → 콘솔 출력
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# 프로젝트 루트 기준 import
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services" / "api"))

PROCESSED = ROOT / "data" / "processed"


def _load_env():
    env = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    os.environ.update(env)
    return env


def main():
    print("=" * 60)
    print("  GL 하루온 수요예측 파이프라인 v0.1")
    print("=" * 60)

    env = _load_env()

    # ─── Step 1: weekly_df 빌드 ───
    print("\n[Step 1] weekly_df 빌드")
    from supabase import create_client
    from services.api.data_pipeline.local_feature_builder import build_local_weekly_df

    client = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    weekly_df, diag = build_local_weekly_df(
        client, apply_stockout_mask=True, include_bi_box_features=True,
    )

    import pandas as pd

    # bi_box NaN 채우기
    weekly_df["weekly_stockout_flag"] = weekly_df["weekly_stockout_flag"].fillna(0).astype(int)
    weekly_df["weekly_stockout_days"] = weekly_df["weekly_stockout_days"].fillna(0)
    weekly_df["weekly_min_price"] = weekly_df["weekly_min_price"].fillna(
        weekly_df["weekly_min_price"].median()
    )
    weekly_df["weekly_bi_box_share_mean"] = weekly_df["weekly_bi_box_share_mean"].fillna(1.0)
    weekly_df.to_csv(PROCESSED / "weekly_feature_table.csv", index=False)

    print(f"  → {diag['merged_rows']}행, {diag['skus']} SKU, 마스킹 {diag['stockout_masked_rows']}행 제거")

    # ─── Step 2: Model A ───
    print("\n[Step 2] Model A 학습 + 예측")
    from services.api.analytics.weekly_demand_forecast import (
        WeeklyForecastConfig,
        run_baseline_pipeline,
    )

    # R5에서 review_count/avg_rating 추가 실험 → val MAE 1,615 악화
    # (리뷰는 판매의 결과이지 원인이 아님 — 동시 지표 편향)
    # R4 피처셋 유지
    cfg = WeeklyForecastConfig(
        exog_cols=(
            "temp_mean", "temp_min", "temp_max", "rain_mm", "snow_cm", "wind_mean",
            "cold_days_7d", "temp_range", "promotion_flag",
            "weekly_min_price", "weekly_bi_box_share_mean", "weekly_stockout_flag",
        ),
    )
    forecast_df, model, feature_cols, metrics, missing = run_baseline_pipeline(
        weekly_df, model_kind="lightgbm", config=cfg,
    )
    forecast_df.to_csv(PROCESSED / "forecast_latest.csv", index=False)

    today = pd.Timestamp.today().normalize()
    future_only = forecast_df[pd.to_datetime(forecast_df["week_start"]) >= today]

    print(f"  → train_mae={metrics['train_mae']:.0f}, val_mae={metrics['val_mae']:.0f}")
    print(f"  → 예측 {len(forecast_df)}행 (미래 {len(future_only)}행)")

    # ─── Step 3: Model B ───
    print("\n[Step 3] Model B 발주 반응 추정")
    from data_pipeline.delivery_rate_loader import load_hotpack_delivery
    from services.api.analytics.order_response_model import run_model_b_pipeline

    delivery = load_hotpack_delivery()
    result_b = run_model_b_pipeline(weekly_df, delivery, forecast_df)

    sku_dist = result_b["sku_distribution"]
    sku_dist.to_csv(PROCESSED / "model_b_sku_distribution.csv", index=False)
    result_b["ratio_result"].merge(
        result_b["linear_result"], on="week_start"
    ).to_csv(PROCESSED / "model_b_category_forecast.csv", index=False)
    result_b["training_data"].to_csv(PROCESSED / "model_b_training_data.csv", index=False)

    bd = result_b["diagnostics"]
    print(f"  → 학습 {bd['training_rows']}행, 미래 {bd['future_weeks']}주")
    print(f"  → SKU 분배 {bd['sku_count']} SKU 활성")

    # ─── Step 4: 인사이트 ───
    print("\n[Step 4] AI 인사이트 생성")
    from services.api.analytics.insight_generator import (
        build_insight_context_from_local,
        generate_forecast_insight,
    )

    ctx = build_insight_context_from_local()
    insight = generate_forecast_insight(ctx)
    print(f"\n{'─' * 50}")
    print(insight)
    print(f"{'─' * 50}")

    # ─── 요약 ───
    print("\n" + "=" * 60)
    print("  파이프라인 완료")
    print(f"  Model A: val_mae={metrics['val_mae']:.0f}")
    print(f"  Model B: {bd['sku_count']} SKU 발주 분배")
    print(f"  산출물: {PROCESSED}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
