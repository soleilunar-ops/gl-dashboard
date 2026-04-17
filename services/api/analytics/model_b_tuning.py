"""
Model B 하이퍼파라미터 튜닝.

`ratio_lookback_weeks`: 최근 N주 발주/판매 비율로 다음 주 발주 추정
`sku_distribute_weeks`: 최근 M주 SKU별 판매 비율로 카테고리→SKU 분배

튜닝 방법:
  여러 N, M 값 조합에 대해 시간 기반 교차검증:
  - 학습: 전체 중 처음 (총주차 - 4주)
  - 검증: 마지막 4주 (실측 발주요청량과 비교)
  - MAE 최저 조합 선택
"""
from __future__ import annotations

import sys
from pathlib import Path as _P

_root = _P(__file__).resolve().parents[3]
sys.path.insert(0, str(_root))
sys.path.insert(0, str(_root / "services" / "api"))

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

from data_pipeline.delivery_rate_loader import load_hotpack_delivery
from analytics.order_response_model import (
    ModelBConfig,
    build_model_b_training_data,
    ratio_model_predict,
)


def tune_lookback(
    weekly_sales_df: pd.DataFrame,
    delivery_df: pd.DataFrame,
    candidates: list[int] = [4, 6, 8, 10, 12, 16],
) -> dict:
    """
    ratio_lookback_weeks 튜닝.
    """
    training = build_model_b_training_data(weekly_sales_df, delivery_df)
    if len(training) < 20:
        return {"error": f"학습 데이터 부족 ({len(training)}행)"}

    # 시간 순 정렬
    training = training.sort_values("week_start").reset_index(drop=True)
    n = len(training)
    test_size = 4

    results = {}
    for lookback in candidates:
        mae_list = []
        # 워킹 포워드 검증: 마지막 8주를 테스트 시작점으로 사용
        for test_start in range(max(lookback, n - 8), n - test_size + 1):
            train = training.iloc[:test_start]
            test = training.iloc[test_start : test_start + test_size]
            if len(train) < lookback:
                continue
            recent = train.tail(lookback)
            total_req = recent["units_requested"].sum()
            total_sale = recent["total_sales"].replace(0, np.nan).sum()
            if pd.isna(total_sale) or total_sale == 0:
                continue
            ratio = total_req / total_sale
            predicted = test["total_sales"] * ratio
            mae = mean_absolute_error(test["units_requested"], predicted)
            mae_list.append(mae)
        results[lookback] = {
            "folds": len(mae_list),
            "avg_mae": round(float(np.mean(mae_list)), 1) if mae_list else None,
        }
    return results


def tune_sku_distribute(
    weekly_sales_df: pd.DataFrame,
    candidates: list[int] = [2, 4, 6, 8, 12],
) -> dict:
    """
    sku_distribute_weeks 튜닝.

    방법: 마지막 4주 SKU 판매를 타겟으로, 각 lookback N주 비율로 분배한 예측 vs 실측 비교.
    """
    df = weekly_sales_df.copy()
    df["week_start"] = pd.to_datetime(df["week_start"])

    last_week = df["week_start"].max()
    target_weeks = [last_week - pd.Timedelta(weeks=i) for i in range(4)]
    target = df[df["week_start"].isin(target_weeks)]
    target_totals = target.groupby("sku")["weekly_sales_qty"].sum()

    results = {}
    for n_weeks in candidates:
        ref_start = last_week - pd.Timedelta(weeks=4 + n_weeks)
        ref_end = last_week - pd.Timedelta(weeks=4)
        ref = df[(df["week_start"] > ref_start) & (df["week_start"] <= ref_end)]
        if ref.empty:
            continue
        ref_totals = ref.groupby("sku")["weekly_sales_qty"].sum()
        if ref_totals.sum() == 0:
            continue
        ref_ratios = ref_totals / ref_totals.sum()

        # 예측: 직전 N주 비율로 target 총량을 분배
        predicted_per_sku = target_totals.sum() * ref_ratios
        mae = mean_absolute_error(
            target_totals.reindex(ref_ratios.index, fill_value=0),
            predicted_per_sku,
        )
        results[n_weeks] = {
            "mae": round(float(mae), 1),
            "skus_in_ref": len(ref_ratios[ref_ratios > 0]),
        }
    return results


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")

    weekly_sales = pd.read_csv("data/processed/weekly_feature_table.csv", parse_dates=["week_start"])
    delivery = load_hotpack_delivery()

    print("=" * 60)
    print("  ratio_lookback_weeks 튜닝")
    print("=" * 60)
    lb_results = tune_lookback(weekly_sales, delivery)
    for lb, r in sorted(lb_results.items()):
        avg = r.get("avg_mae")
        print(f"  {lb}주: folds={r.get('folds',0)}, 평균 MAE={avg if avg else 'N/A'}")

    # 최적 선택
    valid_lb = {k: v["avg_mae"] for k, v in lb_results.items() if v.get("avg_mae") is not None}
    if valid_lb:
        best_lb = min(valid_lb, key=valid_lb.get)
        print(f"\n최적 lookback: {best_lb}주 (MAE {valid_lb[best_lb]})")

    print("\n" + "=" * 60)
    print("  sku_distribute_weeks 튜닝")
    print("=" * 60)
    sd_results = tune_sku_distribute(weekly_sales)
    for n, r in sorted(sd_results.items()):
        print(f"  {n}주: SKU {r['skus_in_ref']}개, MAE {r['mae']}")

    valid_sd = {k: v["mae"] for k, v in sd_results.items() if v.get("mae") is not None}
    if valid_sd:
        best_sd = min(valid_sd, key=valid_sd.get)
        print(f"\n최적 distribute: {best_sd}주 (MAE {valid_sd[best_sd]})")

    # 결과 저장
    import json
    out = _P("data/processed/model_b_tuning.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({
            "lookback": lb_results,
            "distribute": sd_results,
        }, f, ensure_ascii=False, indent=2)
    print(f"\n저장: {out}")
