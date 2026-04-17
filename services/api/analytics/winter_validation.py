"""
합성 2024 + 실 2025~2026 결합 → Model A 겨울 검증.

논리:
  학습: 합성 2024(53주) + 실 2025-04~09(봄+여름 ~26주)
  검증: 실 2025-10 ~ 2026-04 (가을+겨울+시즌종료 ~28주)
  → 검증에 실제 겨울 포함 → 처음으로 겨울 MAE 측정 가능

원칙:
  합성은 학습에만, 검증은 반드시 실데이터만.

비교:
  A) 합성 없음 (현재): 실 54주 → val 8주(봄)
  B) 합성 포함 (신규): 합성53+실26 학습 → 실 28주(겨울 포함) 검증
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

PROCESSED = Path("data/processed")


def load_combined_training_data() -> pd.DataFrame:
    """합성 2024 + 실 2025~2026 결합."""
    real = pd.read_csv(PROCESSED / "weekly_feature_table.csv", parse_dates=["week_start"])
    synth = pd.read_csv(PROCESSED / "synthetic_2024_weekly.csv", parse_dates=["week_start"])

    # 합성에 없는 실데이터 전용 컬럼을 NaN으로 맞춤
    missing_cols = set(real.columns) - set(synth.columns)
    for c in missing_cols:
        synth[c] = np.nan

    # NaN 채우기 — 실데이터의 통계량을 합성에도 동일 적용 (합성 전체 NaN인 컬럼 대응)
    real_price_median = real["weekly_min_price"].median() if "weekly_min_price" in real.columns else 0

    for df in [real, synth]:
        if "weekly_stockout_flag" in df.columns:
            df["weekly_stockout_flag"] = df["weekly_stockout_flag"].fillna(0).astype(int)
        if "weekly_stockout_days" in df.columns:
            df["weekly_stockout_days"] = df["weekly_stockout_days"].fillna(0)
        if "weekly_min_price" in df.columns:
            df["weekly_min_price"] = df["weekly_min_price"].fillna(real_price_median)
        if "weekly_bi_box_share_mean" in df.columns:
            df["weekly_bi_box_share_mean"] = df["weekly_bi_box_share_mean"].fillna(1.0)

    # synthetic 플래그 추가
    real["is_synthetic"] = 0
    synth["is_synthetic"] = 1

    combined = pd.concat([synth, real], ignore_index=True)
    combined = combined.sort_values(["sku", "week_start"]).reset_index(drop=True)
    return combined


def split_for_winter_validation(
    combined: pd.DataFrame,
    val_start: str = "2025-10-01",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    학습 = 합성 2024 + 실 2025-04~09
    검증 = 실 2025-10 ~ 2026-04 (겨울 포함)
    """
    val_start_ts = pd.Timestamp(val_start)

    # 검증: 실데이터 중 2025-10 이후
    val = combined[(combined["is_synthetic"] == 0) & (combined["week_start"] >= val_start_ts)]

    # 학습: 나머지 (합성 전체 + 실데이터 2025-10 이전)
    train = combined[~combined.index.isin(val.index)]

    return train, val


def run_winter_validation_comparison() -> dict:
    """A(합성없음) vs B(합성포함) 두 모델 비교."""
    import sys
    from pathlib import Path as _P
    root = _P(__file__).resolve().parents[3]
    sys.path.insert(0, str(root))
    sys.path.insert(0, str(root / "services" / "api"))
    from analytics.weekly_demand_forecast import (
        WeeklyForecastConfig,
        prepare_training_matrix,
        time_based_train_val_split,
        train_lightgbm_model,
        evaluate_regression,
    )

    cfg = WeeklyForecastConfig(
        exog_cols=(
            "temp_mean", "temp_min", "temp_max", "rain_mm", "snow_cm", "wind_mean",
            "cold_days_7d", "temp_range", "promotion_flag",
            "weekly_min_price", "weekly_bi_box_share_mean", "weekly_stockout_flag",
        ),
    )

    results = {}

    # ── A) 합성 없음 — 실데이터 54주만 ──
    print("\n[A] 합성 없음: 실데이터 54주만")
    real = pd.read_csv(PROCESSED / "weekly_feature_table.csv", parse_dates=["week_start"])
    real["weekly_stockout_flag"] = real["weekly_stockout_flag"].fillna(0).astype(int)
    real["weekly_stockout_days"] = real["weekly_stockout_days"].fillna(0)
    real["weekly_min_price"] = real["weekly_min_price"].fillna(real["weekly_min_price"].median())
    real["weekly_bi_box_share_mean"] = real["weekly_bi_box_share_mean"].fillna(1.0)

    trainable_a, feat_a, _ = prepare_training_matrix(real, cfg)
    tr_a, va_a = time_based_train_val_split(trainable_a, cfg, val_weeks=8)
    print(f"  학습 {len(tr_a)}행 ({tr_a['week_start'].min().date()}~{tr_a['week_start'].max().date()})")
    print(f"  검증 {len(va_a)}행 ({va_a['week_start'].min().date()}~{va_a['week_start'].max().date()})")
    print(f"  검증 기간 계절: 봄(비시즌)")

    model_a = train_lightgbm_model(tr_a, va_a, feat_a, cfg.target_col)
    train_mae_a = evaluate_regression(model_a, tr_a, feat_a, cfg.target_col, kind="lightgbm")
    val_mae_a = evaluate_regression(model_a, va_a, feat_a, cfg.target_col, kind="lightgbm")
    results["A_no_synthetic"] = {
        "train_mae": round(train_mae_a, 1),
        "val_mae": round(val_mae_a, 1),
        "train_rows": len(tr_a),
        "val_rows": len(va_a),
        "val_period": f"{va_a['week_start'].min().date()} ~ {va_a['week_start'].max().date()}",
        "val_season": "봄(비시즌)",
    }
    print(f"  → train MAE {train_mae_a:.0f}, val MAE {val_mae_a:.0f}")

    # ── B) 합성 포함 — 합성 2024 + 실 2025~2026 ──
    print("\n[B] 합성 포함: 합성 2024 + 실 2025~2026")
    combined = load_combined_training_data()
    tr_b, va_b = split_for_winter_validation(combined, val_start="2025-10-01")

    # prepare_training_matrix는 lag 피처 생성하므로 combined 전체에 적용 후 split
    trainable_b, feat_b, _ = prepare_training_matrix(combined, cfg)
    # 검증: 실데이터 2025-10 이후
    val_mask_b = (trainable_b["is_synthetic"] == 0) & (trainable_b["week_start"] >= "2025-10-01")
    tr_b = trainable_b[~val_mask_b]
    va_b = trainable_b[val_mask_b]

    print(f"  학습 {len(tr_b)}행 ({tr_b['week_start'].min().date()}~{tr_b['week_start'].max().date()})")
    print(f"   - 합성 {(tr_b['is_synthetic']==1).sum()}행 + 실 {(tr_b['is_synthetic']==0).sum()}행")
    print(f"  검증 {len(va_b)}행 ({va_b['week_start'].min().date()}~{va_b['week_start'].max().date()})")
    print(f"  검증 기간: 가을+★겨울★+시즌종료")

    model_b = train_lightgbm_model(tr_b, va_b, feat_b, cfg.target_col)
    train_mae_b = evaluate_regression(model_b, tr_b, feat_b, cfg.target_col, kind="lightgbm")
    val_mae_b = evaluate_regression(model_b, va_b, feat_b, cfg.target_col, kind="lightgbm")

    # 겨울(11~1월)만 따로 MAE
    winter_mask = va_b["week_start"].dt.month.isin([11, 12, 1])
    va_winter = va_b[winter_mask]
    if len(va_winter) > 0:
        winter_mae = evaluate_regression(model_b, va_winter, feat_b, cfg.target_col, kind="lightgbm")
    else:
        winter_mae = float("nan")

    results["B_with_synthetic"] = {
        "train_mae": round(train_mae_b, 1),
        "val_mae": round(val_mae_b, 1),
        "winter_mae": round(winter_mae, 1),
        "train_rows": len(tr_b),
        "train_synthetic": int((tr_b["is_synthetic"] == 1).sum()),
        "train_real": int((tr_b["is_synthetic"] == 0).sum()),
        "val_rows": len(va_b),
        "val_period": f"{va_b['week_start'].min().date()} ~ {va_b['week_start'].max().date()}",
        "val_season": "가을+겨울+시즌종료",
        "val_winter_rows": len(va_winter),
    }
    print(f"  → train MAE {train_mae_b:.0f}, val MAE {val_mae_b:.0f}")
    print(f"  → 겨울(11~1월) MAE {winter_mae:.0f}  ← 처음으로 측정된 값")

    return results


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print("  Model A 겨울 검증 비교 (합성 없음 vs 합성 포함)")
    print("=" * 60)
    results = run_winter_validation_comparison()

    print("\n" + "=" * 60)
    print("  최종 비교")
    print("=" * 60)
    for key, r in results.items():
        print(f"\n{key}:")
        for k, v in r.items():
            print(f"  {k}: {v}")

    # 결과 저장
    import json
    out = PROCESSED / "winter_validation_result.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n저장: {out}")
