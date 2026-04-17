"""
주간 피처 테이블 CSV를 읽어 베이스라인 주간 수요 예측(향후 4주)을 수행하고 CSV로 저장한다.

변경 이유: 레포에 샘플 CSV를 두지 않으므로 --input 경로를 필수로 두고, 더미 데이터 없이 실행하도록 함
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pandas as pd

from analytics.weekly_demand_forecast import WeeklyForecastConfig, run_baseline_pipeline


def main() -> None:
    p = argparse.ArgumentParser(description="SKU별 주간 weekly_sales_qty 4주 선행 예측 (LightGBM / 선형회귀)")
    p.add_argument(
        "--input",
        type=Path,
        required=True,
        help="weekly_feature_table 형식의 CSV 경로(피처 파이프라인 산출물, 레포에 샘플 없음)",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=Path("forecast_next_4weeks.csv"),
        help="예측 결과 저장 경로",
    )
    p.add_argument(
        "--model",
        choices=["lightgbm", "linear"],
        default="lightgbm",
        help="학습 모델 종류",
    )
    p.add_argument("--val-weeks", type=int, default=8, help="검증에 사용할 최근 주 수")
    p.add_argument(
        "--future-exog",
        type=Path,
        default=None,
        help="(선택) 미래 주별 외생변수 CSV (week_start 필수, sku 선택)",
    )
    args = p.parse_args()

    weekly = pd.read_csv(args.input)
    weekly["week_start"] = pd.to_datetime(weekly["week_start"])

    future_exog: pd.DataFrame | None = None
    if args.future_exog is not None:
        future_exog = pd.read_csv(args.future_exog)
        future_exog["week_start"] = pd.to_datetime(future_exog["week_start"])

    cfg = WeeklyForecastConfig()
    forecast_df, _model, feature_cols, metrics, missing_exog = run_baseline_pipeline(
        weekly,
        model_kind=args.model,
        val_weeks=args.val_weeks,
        config=cfg,
        future_exog=future_exog,
    )

    forecast_df.to_csv(args.output, index=False)
    print("저장:", args.output.resolve())
    print("피처 컬럼:", feature_cols)
    print("학습/검증 MAE:", metrics)
    if missing_exog:
        print("데이터에 없어 제외된 외생변수:", missing_exog)
    print("예측 행 수:", len(forecast_df))


if __name__ == "__main__":
    main()
