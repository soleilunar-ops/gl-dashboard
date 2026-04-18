"""
상위 Top 5 SKU별 개별 LightGBM 모델.

이유:
  단일 글로벌 모델은 모든 34 SKU를 한꺼번에 학습 → 각 SKU 특성 반영 약함.
  Top 5 SKU(판매의 대부분)는 개별 모델이 더 정확할 가능성.

방법:
  1) 전체 판매 상위 5 SKU 선정
  2) 각 SKU에 대해 별도 LightGBM 학습
  3) 글로벌 모델과 MAE 비교

입력: weekly_feature_table.csv + synthetic_2024_weekly.csv
출력: per_sku_model_comparison.json
"""
from __future__ import annotations

import sys
import json
from pathlib import Path as _P

_root = _P(__file__).resolve().parents[3]
sys.path.insert(0, str(_root))
sys.path.insert(0, str(_root / "services" / "api"))

import numpy as np
import pandas as pd

PROCESSED = _root / "data" / "processed"


def run_per_sku_comparison() -> dict:
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

    # 전체 판매 상위 5 SKU
    sku_totals = combined.groupby("sku")["weekly_sales_qty"].sum().sort_values(ascending=False)
    top5 = sku_totals.head(5).index.tolist()

    # === 글로벌 모델 (전체 34 SKU 한 번에) ===
    trainable, feat, _ = prepare_training_matrix(combined, cfg)
    val_mask = (trainable["is_synthetic"] == 0) & (trainable["week_start"] >= "2025-10-01")
    train_all = trainable[~val_mask]
    val_all = trainable[val_mask].copy()

    global_model = train_lightgbm_model(train_all, val_all, feat, cfg.target_col)
    X_val_all = val_all[feat].to_numpy(dtype=float)
    ni = getattr(global_model, "best_iteration", None)
    val_all["pred"] = global_model.predict(X_val_all, num_iteration=ni) if ni else global_model.predict(X_val_all)
    val_all["ae"] = (val_all[cfg.target_col] - val_all["pred"]).abs()

    global_per_sku_mae = {
        int(s): float(val_all[val_all["sku"] == s]["ae"].mean())
        for s in top5 if len(val_all[val_all["sku"] == s])
    }

    # === 개별 모델 (Top 5 각각) ===
    per_sku_mae = {}
    for sku in top5:
        sku_data = combined[combined["sku"] == sku].copy()
        if len(sku_data) < 30:
            continue
        tr_sku, feat_sku, _ = prepare_training_matrix(sku_data, cfg)
        if tr_sku.empty:
            per_sku_mae[int(sku)] = None
            continue
        val_sku_mask = (tr_sku["is_synthetic"] == 0) & (tr_sku["week_start"] >= "2025-10-01")
        train_sku = tr_sku[~val_sku_mask]
        val_sku = tr_sku[val_sku_mask].copy()
        if len(val_sku) == 0 or len(train_sku) < 10:
            per_sku_mae[int(sku)] = None
            continue

        model = train_lightgbm_model(train_sku, val_sku, feat_sku, cfg.target_col)
        X_val = val_sku[feat_sku].to_numpy(dtype=float)
        ni2 = getattr(model, "best_iteration", None)
        pred = model.predict(X_val, num_iteration=ni2) if ni2 else model.predict(X_val)
        mae = float(np.abs(val_sku[cfg.target_col].to_numpy(dtype=float) - pred).mean())
        per_sku_mae[int(sku)] = round(mae, 1)

    # 비교 표
    comparison = []
    for sku in top5:
        sku_int = int(sku)
        global_mae = round(global_per_sku_mae.get(sku_int, 0), 1)
        ind_mae = per_sku_mae.get(sku_int)
        total_sales = int(sku_totals[sku])
        weekly_avg = int(total_sales / len(combined[combined["sku"] == sku]["week_start"].unique()))
        improvement_pct = None
        if ind_mae is not None and global_mae > 0:
            improvement_pct = round((global_mae - ind_mae) / global_mae * 100, 1)
        comparison.append({
            "sku": sku_int,
            "total_sales": total_sales,
            "weekly_avg": weekly_avg,
            "global_model_mae": global_mae,
            "individual_model_mae": ind_mae,
            "improvement_pct": improvement_pct,
        })

    summary = {
        "top5_skus": [int(s) for s in top5],
        "comparison": comparison,
        "conclusion": _make_conclusion(comparison),
    }

    out = PROCESSED / "per_sku_model_comparison.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    summary["output_file"] = str(out)
    return summary


def _make_conclusion(comparison: list[dict]) -> str:
    improvements = [c["improvement_pct"] for c in comparison if c["improvement_pct"] is not None]
    if not improvements:
        return "개별 모델 학습 실패 (데이터 부족)"
    avg_imp = sum(improvements) / len(improvements)
    better = sum(1 for x in improvements if x > 0)
    if avg_imp > 5:
        return f"개별 모델 권장 ({better}/{len(improvements)} 개선, 평균 {avg_imp:.1f}%)"
    elif avg_imp > 0:
        return f"미세 개선 ({better}/{len(improvements)} 개선, 평균 {avg_imp:.1f}%)"
    else:
        return f"개별 모델이 오히려 나쁨 (평균 {avg_imp:.1f}%, 과적합 추정)"


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print("  상위 Top 5 SKU 개별 모델 vs 글로벌 모델")
    print("=" * 60)
    s = run_per_sku_comparison()
    print(f"\nTop 5 SKUs: {s['top5_skus']}\n")
    print(f"{'SKU':<12} {'주평균':>10} {'글로벌MAE':>12} {'개별MAE':>12} {'개선%':>10}")
    for c in s["comparison"]:
        ind = c["individual_model_mae"]
        imp = c["improvement_pct"]
        print(f"{c['sku']:<12} {c['weekly_avg']:>10,} {c['global_model_mae']:>12} {ind if ind else 'N/A':>12} {imp if imp is not None else 'N/A':>10}")
    print(f"\n결론: {s['conclusion']}")
    print(f"저장: {s['output_file']}")
