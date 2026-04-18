"""
모델 배치 결과를 Supabase에 UPSERT/INSERT.

대상 테이블 (2026-04-18 PM DDL):
- forecast_model_a: Model A LightGBM SKU별 주간 예측
- forecast_model_b: Model B 카테고리 총량 + SKU 분배
- winter_validation: 겨울 검증 결과 (grain = weekly/sku/summary)

모든 함수에 `used_synthetic: bool` 파라미터 필수 (합성 2024 학습 여부 row 단위 기록).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd


def _to_date_str(v: Any) -> str:
    """week_start 등 date 값을 ISO 문자열로 통일."""
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    return str(v)[:10]


def _to_sku_str(v: Any) -> str | None:
    """SKU 값을 정수 문자열로 통일 ('63575566.0' → '63575566')."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return str(int(float(v)))
    except (TypeError, ValueError):
        return str(v)


def _fetch_sku_master_ids(client) -> set[str]:
    """FK 제약 충족을 위한 sku_master 전체 SKU 목록."""
    try:
        res = client.table("sku_master").select("sku_id").execute()
        return {str(r["sku_id"]) for r in (res.data or [])}
    except Exception:
        return set()


def _to_float_or_none(v: Any) -> float | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None


# ───────────────────────────────────────────────────────────
# Model A → forecast_model_a
# ───────────────────────────────────────────────────────────
def save_forecast_model_a(
    client,
    forecast_df: pd.DataFrame,
    *,
    model_version: str = "round4",
    used_synthetic: bool = False,
    features_used: list[str] | None = None,
    confidence_interval: float = 0.90,
    val_mae: float | None = None,
    batch_size: int = 500,
) -> int:
    """
    forecast_df: sku, week_start, weekly_sales_qty_forecast [+ lower_bound, upper_bound 선택]
    """
    if forecast_df is None or forecast_df.empty:
        return 0

    valid_skus = _fetch_sku_master_ids(client)

    records = []
    for _, row in forecast_df.iterrows():
        pred = _to_float_or_none(row.get("weekly_sales_qty_forecast"))
        if pred is None:
            continue
        pred = max(0.0, pred)

        sku_id = _to_sku_str(row["sku"])
        if sku_id is None or (valid_skus and sku_id not in valid_skus):
            continue

        lower = _to_float_or_none(row.get("lower_bound"))
        upper = _to_float_or_none(row.get("upper_bound"))
        if lower is None and val_mae is not None:
            margin = val_mae * 1.645
            lower = max(0.0, pred - margin)
            upper = pred + margin

        records.append({
            "sku_id": sku_id,
            "week_start": _to_date_str(row["week_start"]),
            "model_version": model_version,
            "weekly_sales_qty_forecast": pred,
            "lower_bound": lower,
            "upper_bound": upper,
            "confidence_interval": confidence_interval,
            "features_used": features_used,
            "used_synthetic": used_synthetic,
        })

    return _upsert_batched(
        client, "forecast_model_a", records, batch_size,
        on_conflict="sku_id,week_start,model_version",
    )


# ───────────────────────────────────────────────────────────
# Model B → forecast_model_b
# ───────────────────────────────────────────────────────────
def save_forecast_model_b(
    client,
    category_df: pd.DataFrame | None = None,
    sku_df: pd.DataFrame | None = None,
    *,
    model_version: str = "v1",
    product_category: str = "Home",
    used_synthetic: bool = False,
    lookback_weeks: int = 4,
    distribute_weeks: int = 2,
    batch_size: int = 500,
) -> int:
    """
    category_df: week_start, pred_ratio, pred_linear
    sku_df: week_start, sku, distributed_qty
    PK 중복 방지를 위해 해당 week_start + model_version 범위 삭제 후 insert.
    """
    cat_rows: list[dict] = []
    if category_df is not None and not category_df.empty:
        for _, row in category_df.iterrows():
            cat_rows.append({
                "week_start": _to_date_str(row["week_start"]),
                "product_category": product_category,
                "sku_id": None,
                "pred_ratio": _to_float_or_none(row.get("pred_ratio")),
                "pred_linear": _to_float_or_none(row.get("pred_linear")),
                "distributed_qty": None,
                "model_version": model_version,
                "lookback_weeks": lookback_weeks,
                "distribute_weeks": distribute_weeks,
                "used_synthetic": used_synthetic,
            })

    sku_rows: list[dict] = []
    if sku_df is not None and not sku_df.empty:
        valid_skus = _fetch_sku_master_ids(client)
        for _, row in sku_df.iterrows():
            qty = _to_float_or_none(row.get("distributed_qty") or row.get("predicted_order_qty"))
            if qty is None:
                continue
            sku_id = _to_sku_str(row["sku"])
            if sku_id is None or (valid_skus and sku_id not in valid_skus):
                continue
            sku_rows.append({
                "week_start": _to_date_str(row["week_start"]),
                "product_category": product_category,
                "sku_id": sku_id,
                "pred_ratio": None,
                "pred_linear": None,
                "distributed_qty": qty,
                "model_version": model_version,
                "lookback_weeks": lookback_weeks,
                "distribute_weeks": distribute_weeks,
                "used_synthetic": used_synthetic,
            })

    all_rows = cat_rows + sku_rows
    if not all_rows:
        return 0

    weeks = sorted({r["week_start"] for r in all_rows})
    try:
        client.table("forecast_model_b") \
            .delete() \
            .eq("model_version", model_version) \
            .eq("product_category", product_category) \
            .in_("week_start", weeks) \
            .execute()
    except Exception as ex:
        print(f"  forecast_model_b 기존 row 삭제 실패({ex}), INSERT 계속")

    total = 0
    for i in range(0, len(all_rows), batch_size):
        batch = all_rows[i : i + batch_size]
        client.table("forecast_model_b").insert(batch).execute()
        total += len(batch)
    return total


# ───────────────────────────────────────────────────────────
# Winter validation → winter_validation
# ───────────────────────────────────────────────────────────
def save_winter_validation(
    client,
    *,
    weekly_df: pd.DataFrame | None = None,
    sku_df: pd.DataFrame | None = None,
    summary: dict | None = None,
    run_id: str | None = None,
    used_synthetic: bool = True,
    notes: str = "",
    batch_size: int = 500,
) -> str:
    """
    3-grain INSERT. run_id 반환.

    weekly_df: week_start, actual, predicted, abs_error, error_pct, bias
    sku_df   : sku, actual, predicted, abs_error
    summary  : {overall_mae, winter_mae, val_mae_no_synthetic}
    """
    if run_id is None:
        run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    records: list[dict] = []

    if weekly_df is not None and not weekly_df.empty:
        for _, row in weekly_df.iterrows():
            records.append({
                "run_id": run_id,
                "grain": "weekly",
                "week_start": _to_date_str(row["week_start"]),
                "actual": _to_float_or_none(row.get("actual")),
                "predicted": _to_float_or_none(row.get("predicted")),
                "abs_error": _to_float_or_none(row.get("abs_error")),
                "error_pct": _to_float_or_none(row.get("error_pct")),
                "bias": _to_float_or_none(row.get("bias")),
                "used_synthetic": used_synthetic,
            })

    if sku_df is not None and not sku_df.empty:
        valid_skus = _fetch_sku_master_ids(client)
        for _, row in sku_df.iterrows():
            sku_id = _to_sku_str(row["sku"])
            if sku_id is None or (valid_skus and sku_id not in valid_skus):
                continue
            records.append({
                "run_id": run_id,
                "grain": "sku",
                "sku_id": sku_id,
                "actual": _to_float_or_none(row.get("actual")),
                "predicted": _to_float_or_none(row.get("predicted")),
                "abs_error": _to_float_or_none(row.get("abs_error")),
                "used_synthetic": used_synthetic,
            })

    if summary:
        records.append({
            "run_id": run_id,
            "grain": "summary",
            "overall_mae": _to_float_or_none(summary.get("overall_mae")),
            "winter_mae": _to_float_or_none(summary.get("winter_mae")),
            "val_mae_no_synthetic": _to_float_or_none(summary.get("val_mae_no_synthetic")),
            "used_synthetic": used_synthetic,
            "notes": notes,
        })

    if not records:
        return run_id

    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        client.table("winter_validation").insert(batch).execute()
    return run_id


# ───────────────────────────────────────────────────────────
# 공통 UPSERT 헬퍼 (supabase-py 버전 호환)
# ───────────────────────────────────────────────────────────
def _upsert_batched(
    client, table: str, records: list[dict], batch_size: int, *, on_conflict: str | None = None
) -> int:
    if not records:
        return 0
    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        try:
            if on_conflict:
                client.table(table).upsert(batch, on_conflict=on_conflict).execute()
            else:
                client.table(table).upsert(batch).execute()
        except TypeError:
            client.table(table).upsert(batch).execute()
        total += len(batch)
    return total
