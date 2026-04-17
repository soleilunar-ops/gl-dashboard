"""
겨울 검증 결과 심층 분석.

산출물 (data/processed/):
  - winter_analysis_weekly.csv: 주차별 실측 vs 예측 vs 오차
  - winter_analysis_by_sku.csv: SKU별 MAE + 정확도
  - winter_analysis_summary.json: 과대/과소 편향, 날씨 조건별 오차

논리구조:
  합성+실 결합 모델(B)로 학습 → 검증 구간 예측 → 실측과 비교 분석
"""
from __future__ import annotations

import json
import sys
from pathlib import Path as _P

_root = _P(__file__).resolve().parents[3]
sys.path.insert(0, str(_root))
sys.path.insert(0, str(_root / "services" / "api"))

import numpy as np
import pandas as pd

PROCESSED = _root / "data" / "processed"


def run_winter_deep_analysis() -> dict:
    from analytics.weekly_demand_forecast import (
        WeeklyForecastConfig,
        prepare_training_matrix,
        train_lightgbm_model,
    )
    from analytics.winter_validation import load_combined_training_data

    cfg = WeeklyForecastConfig(
        exog_cols=(
            "temp_mean", "temp_min", "temp_max", "rain_mm", "snow_cm", "wind_mean",
            "cold_days_7d", "temp_range", "promotion_flag",
            "weekly_min_price", "weekly_bi_box_share_mean", "weekly_stockout_flag",
            "first_snow_flag",
        ),
    )

    combined = load_combined_training_data()
    trainable, feat, _ = prepare_training_matrix(combined, cfg)
    val_mask = (trainable["is_synthetic"] == 0) & (trainable["week_start"] >= "2025-10-01")
    train = trainable[~val_mask]
    val = trainable[val_mask].copy()

    model = train_lightgbm_model(train, val, feat, cfg.target_col)
    X_val = val[feat].to_numpy(dtype=float)
    ni = getattr(model, "best_iteration", None)
    val["predicted"] = model.predict(X_val, num_iteration=ni) if ni else model.predict(X_val)
    val["error"] = val[cfg.target_col] - val["predicted"]
    val["abs_error"] = val["error"].abs()
    val["month"] = val["week_start"].dt.month

    # ═══════════ ① 주차별 집계 ═══════════
    weekly = val.groupby("week_start", as_index=False).agg(
        actual=(cfg.target_col, "sum"),
        predicted=("predicted", "sum"),
        abs_error=("abs_error", "sum"),
    )
    weekly["error"] = weekly["actual"] - weekly["predicted"]
    weekly["error_pct"] = (weekly["error"] / weekly["actual"].replace(0, np.nan) * 100).round(1)
    weekly["bias"] = weekly["error"].apply(lambda e: "과소" if e > 0 else "과대")
    weekly_out = PROCESSED / "winter_analysis_weekly.csv"
    weekly.to_csv(weekly_out, index=False)

    # ═══════════ ② SKU별 MAE ═══════════
    sku = val.groupby("sku", as_index=False).agg(
        actual_total=(cfg.target_col, "sum"),
        predicted_total=("predicted", "sum"),
        mae=("abs_error", "mean"),
        weeks=("week_start", "nunique"),
    )
    sku["mean_weekly_actual"] = (sku["actual_total"] / sku["weeks"].replace(0, 1)).round(0)
    sku["mae_pct"] = (sku["mae"] / sku["mean_weekly_actual"].replace(0, np.nan) * 100).round(1)
    sku = sku.sort_values("mae", ascending=False)
    sku_out = PROCESSED / "winter_analysis_by_sku.csv"
    sku.to_csv(sku_out, index=False)

    # ═══════════ ③ 과대/과소 편향 ═══════════
    over = (weekly["error"] < 0).sum()  # 예측 > 실제 = 과대
    under = (weekly["error"] > 0).sum()
    total_weeks = len(weekly)

    # ═══════════ ④ 날씨 조건별 오차 ═══════════
    val["has_cold"] = (val["cold_days_7d"] > 0).astype(int)
    val["has_snow"] = (val["snow_cm"] > 0).astype(int)
    cold_mae = float(val[val["has_cold"] == 1]["abs_error"].mean())
    no_cold_mae = float(val[val["has_cold"] == 0]["abs_error"].mean())
    snow_mae = float(val[val["has_snow"] == 1]["abs_error"].mean())
    no_snow_mae = float(val[val["has_snow"] == 0]["abs_error"].mean())

    # ═══════════ ⑤ 월별 MAE ═══════════
    monthly = val.groupby("month", as_index=False).agg(
        mae=("abs_error", "mean"),
        actual_total=(cfg.target_col, "sum"),
        predicted_total=("predicted", "sum"),
    )
    monthly["bias"] = monthly.apply(
        lambda r: "과대" if r["predicted_total"] > r["actual_total"] else "과소", axis=1
    )

    # ═══════════ 요약 JSON ═══════════
    summary = {
        "val_period": f"{weekly['week_start'].min().date()} ~ {weekly['week_start'].max().date()}",
        "total_weeks": total_weeks,
        "overall_mae": round(float(val["abs_error"].mean()), 1),
        "winter_mae": round(float(val[val["month"].isin([11, 12, 1])]["abs_error"].mean()), 1),
        "bias": {
            "over_predict_weeks": int(over),
            "under_predict_weeks": int(under),
            "over_predict_ratio": round(over / total_weeks, 3),
        },
        "by_weather": {
            "with_cold_wave": {"mae": round(cold_mae, 1), "weeks": int(val["has_cold"].sum())},
            "without_cold_wave": {"mae": round(no_cold_mae, 1)},
            "with_snow": {"mae": round(snow_mae, 1), "weeks": int(val["has_snow"].sum())},
            "without_snow": {"mae": round(no_snow_mae, 1)},
        },
        "by_month": [
            {
                "month": int(r["month"]),
                "mae": round(float(r["mae"]), 1),
                "actual": int(r["actual_total"]),
                "predicted": int(r["predicted_total"]),
                "bias": r["bias"],
                "error_pct": round((r["predicted_total"] - r["actual_total"]) / max(r["actual_total"], 1) * 100, 1),
            }
            for _, r in monthly.iterrows()
        ],
        "by_sku_top5_worst": [
            {
                "sku": int(r["sku"]),
                "mae": round(float(r["mae"]), 1),
                "mean_weekly_actual": int(r["mean_weekly_actual"]),
                "mae_pct": float(r["mae_pct"]) if pd.notna(r["mae_pct"]) else None,
            }
            for _, r in sku.head(5).iterrows()
        ],
        "by_sku_top5_best": [
            {
                "sku": int(r["sku"]),
                "mae": round(float(r["mae"]), 1),
                "mean_weekly_actual": int(r["mean_weekly_actual"]),
                "mae_pct": float(r["mae_pct"]) if pd.notna(r["mae_pct"]) else None,
            }
            for _, r in sku.tail(5).iterrows()
        ],
        "output_files": {
            "weekly": str(weekly_out),
            "by_sku": str(sku_out),
        },
    }

    summary_out = PROCESSED / "winter_analysis_summary.json"
    with open(summary_out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print("  겨울 검증 심층 분석")
    print("=" * 60)
    s = run_winter_deep_analysis()

    print(f"\n검증 기간: {s['val_period']} ({s['total_weeks']}주)")
    print(f"전체 MAE: {s['overall_mae']}")
    print(f"겨울(11~1월) MAE: {s['winter_mae']}")

    print(f"\n[편향] 과대 {s['bias']['over_predict_weeks']}주 / 과소 {s['bias']['under_predict_weeks']}주")
    print(f"과대 비율: {s['bias']['over_predict_ratio']*100:.1f}%")

    print(f"\n[날씨 조건별 MAE]")
    print(f"  한파 있음: {s['by_weather']['with_cold_wave']['mae']} ({s['by_weather']['with_cold_wave']['weeks']}주)")
    print(f"  한파 없음: {s['by_weather']['without_cold_wave']['mae']}")
    print(f"  눈 있음:  {s['by_weather']['with_snow']['mae']} ({s['by_weather']['with_snow']['weeks']}주)")
    print(f"  눈 없음:  {s['by_weather']['without_snow']['mae']}")

    print(f"\n[월별]")
    for m in s["by_month"]:
        print(f"  {m['month']}월: MAE {m['mae']} | 실제 {m['actual']:,} vs 예측 {m['predicted']:,} ({m['error_pct']:+.1f}%, {m['bias']})")

    print(f"\n[오차 큰 SKU Top 5]")
    for x in s["by_sku_top5_worst"]:
        print(f"  SKU {x['sku']}: MAE {x['mae']} (주평균판매 {x['mean_weekly_actual']:,}개, 오차율 {x['mae_pct']}%)")

    print(f"\n[오차 작은 SKU Top 5]")
    for x in s["by_sku_top5_best"]:
        print(f"  SKU {x['sku']}: MAE {x['mae']} (주평균판매 {x['mean_weekly_actual']:,}개)")

    print(f"\n저장:")
    for k, v in s["output_files"].items():
        print(f"  {k}: {v}")
    print(f"  summary: {PROCESSED / 'winter_analysis_summary.json'}")
