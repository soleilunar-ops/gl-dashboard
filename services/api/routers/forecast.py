"""
수요 예측 API 라우터.

엔드포인트:
- GET /forecast/latest: forecasts 테이블에서 최신 예측 N건 조회
- GET /forecast/weekly: 향후 N주 SKU별 예측치 조회 (forecasts 테이블)
- POST /forecast/run: 학습 + 추론 파이프라인 실행 후 forecasts에 기록

main.py 에서 다음과 같이 include:
    from services.api.routers import forecast
    app.include_router(forecast.router, prefix="/forecast", tags=["forecast"])
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()

# 프로젝트 루트 (forecast.py 기준 3단계 상위: routers/ → api/ → services/ → root)
PROJECT_ROOT = Path(__file__).resolve().parents[3]
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"


# ────────────────────────────────────────────
# 응답 스키마 (pydantic v2)
# ────────────────────────────────────────────
class ForecastItem(BaseModel):
    product_id: str
    forecast_date: date
    predicted_qty: int | None = None
    model_name: str | None = None
    confidence_lower: int | None = None
    confidence_upper: int | None = None
    confidence_level: float | None = None
    model_version: str | None = None


class ForecastRunRequest(BaseModel):
    model_kind: str = Field(default="lightgbm", description="lightgbm | linear | prophet")
    val_weeks: int = Field(default=8, ge=1, le=52)
    forecast_horizon: int = Field(default=4, ge=1, le=16)
    warmers_only: bool = Field(default=True, description="핫팩(보온소품)만 학습·예측")


class ForecastRunResponse(BaseModel):
    status: str
    model_kind: str
    metrics: dict[str, float]
    inserted_rows: int
    message: str


class InsightResponse(BaseModel):
    insight: str
    generated_at: str
    source: str = "openai"


class OrderSimulationItem(BaseModel):
    week_start: str
    sku: int
    name: str
    predicted_order_qty: int
    sku_ratio: float


class WeeklyPredictionItem(BaseModel):
    week_start: str
    predicted_qty: int
    source: str


class WinterAnalysisItem(BaseModel):
    week_start: str
    actual: int
    predicted: int
    abs_error: int
    error_pct: float
    bias: str


class DailySalesItem(BaseModel):
    sale_date: str
    units_sold: int
    gmv: float


class OrderWeeklyItem(BaseModel):
    """한 주차의 발주 권장 묶음 (카테고리 총량 + 근거 + SKU 분배)."""
    week_start: str
    label: str                       # "이번 주" / "다음 주" / "다다음 주"
    category_total: int              # Model B 카테고리 총 권장 발주량
    model_a_pred_total: int          # Model A 주간 판매 예측 총량 (카테고리 환산 기준)
    ratio_applied: float             # model_b / model_a (= 납품/판매 비율)
    reference_mae: dict              # 참고 Model A 판매 예측 MAE
    notable_cases: list[str]         # 실측 극단 사례 (청중이 판단하도록 공개)
    items: list[dict]                # [{sku, name, predicted_order_qty, sku_ratio}]


class PackDistributionItem(BaseModel):
    category: str  # "붙이는 핫팩" | "손난로" | "일반 핫팩" | "찜질팩"
    pack_size: int  # 포장 단위 (개)
    units_sold: int  # 해당 포장 단위 총 판매량
    pct: float  # 카테고리 내 비중(%)


# ────────────────────────────────────────────
# Supabase 클라이언트 (지연 초기화)
# ────────────────────────────────────────────
def _get_supabase_client() -> Any:
    """
    supabase-py 클라이언트를 SUPABASE_URL/SERVICE_ROLE_KEY 로 초기화.
    환경변수 미설정 시 503 오류로 변환하여 호출부에 명확히 전달한다.
    """
    try:
        from supabase import create_client
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="supabase-py 패키지가 설치되지 않았습니다.",
        ) from exc

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.",
        )
    return create_client(url, key)


# ────────────────────────────────────────────
# 엔드포인트
# ────────────────────────────────────────────
@router.get("/latest", response_model=list[ForecastItem])
def get_latest_forecast(
    limit: int = Query(default=50, ge=1, le=500),
    model_name: str | None = Query(default=None),
) -> list[ForecastItem]:
    """최근 예측 결과 N건 조회."""
    supabase = _get_supabase_client()
    query = supabase.table("forecasts").select("*").order("forecast_date", desc=True).limit(limit)
    if model_name:
        query = query.eq("model_name", model_name)

    res = query.execute()
    rows: list[dict[str, Any]] = res.data or []
    return [ForecastItem(**r) for r in rows]


@router.get("/weekly", response_model=list[ForecastItem])
def get_weekly_forecast(
    weeks: int = Query(default=4, ge=1, le=16),
    product_id: str | None = Query(default=None),
) -> list[ForecastItem]:
    """오늘 이후 N주 예측치 조회."""
    supabase = _get_supabase_client()
    KST = timezone(timedelta(hours=9))
    today = datetime.now(KST).date().isoformat()

    query = (
        supabase.table("forecasts")
        .select("*")
        .gte("forecast_date", today)
        .order("forecast_date", desc=False)
        .limit(weeks * 200)
    )
    if product_id:
        query = query.eq("product_id", product_id)

    res = query.execute()
    rows: list[dict[str, Any]] = res.data or []
    return [ForecastItem(**r) for r in rows]


@router.get("/insight", response_model=InsightResponse)
def get_forecast_insight(
    model: str = Query(default="gpt-4o-mini", description="OpenAI 모델"),
) -> InsightResponse:
    """
    Model A/B 예측 + 날씨 데이터 기반 발주 인사이트 생성 (3~5줄).

    컨텍스트 소스 우선순위:
      1) Supabase (forecast_model_a/b, v_weather_hybrid, bi_box_daily)
      2) 로컬 CSV (forecast_round4.csv, model_b_category_forecast.csv, asos_weather_cache.csv, bi_box/)

    OpenAI API 키 없으면 룰 기반 fallback 반환.
    """
    try:
        from analytics.insight_generator import (
            build_insight_context_from_local,
            build_insight_context_from_supabase,
            generate_forecast_insight,
        )
    except ImportError:
        from services.api.analytics.insight_generator import (
            build_insight_context_from_local,
            build_insight_context_from_supabase,
            generate_forecast_insight,
        )

    KST = timezone(timedelta(hours=9))

    # 1순위: Supabase 컨텍스트
    ctx = None
    try:
        sb = _get_supabase_client()
        ctx = build_insight_context_from_supabase(sb)
    except Exception:
        ctx = None

    # 2순위: 로컬 CSV fallback
    if ctx is None:
        ctx = build_insight_context_from_local(
            forecast_csv=str(PROCESSED_DIR / "forecast_round4.csv"),
            model_b_csv=str(PROCESSED_DIR / "model_b_category_forecast.csv"),
            weather_cache=str(PROCESSED_DIR / "asos_weather_cache.csv"),
            bi_box_dir=str(PROJECT_ROOT / "data" / "raw" / "coupang" / "bi_box"),
        )

    insight = generate_forecast_insight(ctx, model=model)
    source = "fallback" if "[" in insight and "OpenAI" in insight else "openai"
    if not os.getenv("OPENAI_API_KEY", "").strip():
        source = "fallback"

    return InsightResponse(
        insight=insight,
        generated_at=datetime.now(KST).isoformat(),
        source=source,
    )


@router.get("/order-simulation", response_model=list[OrderSimulationItem])
def get_order_simulation() -> list[OrderSimulationItem]:
    """
    Model B 발주 시뮬레이션.

    우선순위:
      1순위 — Supabase forecast_model_b (sku_id IS NOT NULL, 최신 model_version)
      2순위 — 로컬 data/processed/model_b_sku_distribution.csv
    """
    import pandas as pd

    try:
        from data_pipeline.bi_box_loader import build_sku_name_map
        from data_pipeline.weekly_feature_builder import WARMER_SKUS
    except ImportError:
        from services.api.data_pipeline.bi_box_loader import build_sku_name_map
        from services.api.data_pipeline.weekly_feature_builder import WARMER_SKUS

    bi_box_dir = PROJECT_ROOT / "data" / "raw" / "coupang" / "bi_box"
    # Supabase 우선으로 SKU 이름 매핑 (실패 시 CSV)
    try:
        sb_for_names = _get_supabase_client()
    except Exception:
        sb_for_names = None
    try:
        name_map = build_sku_name_map(directory=bi_box_dir, skus=WARMER_SKUS, client=sb_for_names)
    except Exception:
        name_map = {}

    KST = timezone(timedelta(hours=9))
    today = datetime.now(KST).date()

    # ── 1순위: Supabase forecast_model_b ──
    try:
        sb = _get_supabase_client()
        latest = (
            sb.table("forecast_model_b").select("model_version,generated_at")
            .order("generated_at", desc=True).limit(1).execute()
        )
        if latest.data:
            mv = latest.data[0]["model_version"]
            res = (
                sb.table("forecast_model_b")
                .select("week_start,sku_id,distributed_qty")
                .eq("model_version", mv)
                .not_.is_("sku_id", "null")
                .gte("week_start", today.isoformat())
                .order("week_start").order("distributed_qty", desc=True)
                .limit(500).execute()
            )
            rows = []
            # 주차 × SKU별 비중 재계산 (동일 week_start 내 합 대비)
            df = pd.DataFrame(res.data or [])
            if not df.empty:
                df["distributed_qty"] = df["distributed_qty"].astype(float)
                total_by_week = df.groupby("week_start")["distributed_qty"].transform("sum")
                df["sku_ratio"] = (df["distributed_qty"] / total_by_week).round(4)
                for _, r in df.iterrows():
                    qty = int(round(r["distributed_qty"]))
                    # 발주 대상 아님(월 수요 미미) 구간 필터: ≤50개 제외
                    if qty <= 50:
                        continue
                    sku = int(r["sku_id"])
                    rows.append(OrderSimulationItem(
                        week_start=r["week_start"][:10],
                        sku=sku,
                        name=name_map.get(sku, f"SKU {sku}"),
                        predicted_order_qty=qty,
                        sku_ratio=float(r["sku_ratio"]) if pd.notna(r["sku_ratio"]) else 0.0,
                    ))
                if rows:
                    return rows[:50]
    except Exception:
        pass

    # ── 2순위: CSV fallback ──
    csv_path = PROCESSED_DIR / "model_b_sku_distribution.csv"
    if not csv_path.exists():
        return []

    df = pd.read_csv(csv_path, parse_dates=["week_start"])
    df = df[df["week_start"].dt.date >= today]
    if df.empty:
        return []

    rows = []
    for _, r in df.sort_values(["week_start", "predicted_order_qty"], ascending=[True, False]).iterrows():
        sku = int(r["sku"])
        # 발주 대상 아님(월 수요 미미) 구간 필터: ≤50개 제외
        if r["predicted_order_qty"] <= 50:
            continue
        rows.append(OrderSimulationItem(
            week_start=r["week_start"].strftime("%Y-%m-%d"),
            sku=sku,
            name=name_map.get(sku, f"SKU {sku}"),
            predicted_order_qty=int(r["predicted_order_qty"]),
            sku_ratio=round(float(r["sku_ratio"]), 4),
        ))

    return rows[:50]


@router.get("/order-weekly", response_model=list[OrderWeeklyItem])
def get_order_weekly(qty_threshold: int = Query(default=50, ge=0, le=10000)) -> list[OrderWeeklyItem]:
    """
    주차별 발주 권장 (이번 주 / 다음 주 / 다다음 주) + 계산 근거.

    근거 체인:
      Model A 예측(판매) × 비율(직전 4주 납품/판매) = 카테고리 총량(Model B)
      카테고리 총량 × SKU 비중(직전 2주 점유율) = SKU별 권장 발주량
      qty_threshold 이하 SKU 제외 (기본 50).
    """
    import pandas as pd
    from datetime import date, timedelta

    try:
        from data_pipeline.bi_box_loader import build_sku_name_map
        from data_pipeline.weekly_feature_builder import WARMER_SKUS
    except ImportError:
        from services.api.data_pipeline.bi_box_loader import build_sku_name_map
        from services.api.data_pipeline.weekly_feature_builder import WARMER_SKUS

    sb = _get_supabase_client()
    bi_box_dir = PROJECT_ROOT / "data" / "raw" / "coupang" / "bi_box"
    try:
        name_map = build_sku_name_map(directory=bi_box_dir, skus=WARMER_SKUS, client=sb)
    except Exception:
        name_map = {}

    # 대상 주차: 이번 주 / 다음 주 / 다다음 주 (월요일 기준)
    today = date.today()
    this_week = today - timedelta(days=today.weekday())
    targets = [(this_week + timedelta(weeks=i)).isoformat() for i in range(3)]
    labels = ["이번 주", "다음 주", "다다음 주"]

    # Model B 최신 model_version
    latest_b = (
        sb.table("forecast_model_b").select("model_version,generated_at")
        .order("generated_at", desc=True).limit(1).execute()
    )
    if not latest_b.data:
        return []
    mv_b = latest_b.data[0]["model_version"]

    # 카테고리 총량 조회
    cat_res = (
        sb.table("forecast_model_b")
        .select("week_start,pred_ratio")
        .eq("model_version", mv_b)
        .is_("sku_id", "null")
        .in_("week_start", targets)
        .execute()
    )
    cat_map: dict[str, float] = {
        r["week_start"][:10]: float(r["pred_ratio"] or 0) for r in (cat_res.data or [])
    }

    # SKU별 분배 조회
    sku_res = (
        sb.table("forecast_model_b")
        .select("week_start,sku_id,distributed_qty")
        .eq("model_version", mv_b)
        .not_.is_("sku_id", "null")
        .in_("week_start", targets)
        .order("week_start").order("distributed_qty", desc=True)
        .execute()
    )

    # Model A 주간 예측 총량 (최신 model_version)
    latest_a = (
        sb.table("forecast_model_a").select("model_version,generated_at")
        .order("generated_at", desc=True).limit(1).execute()
    )
    model_a_totals: dict[str, float] = {}
    if latest_a.data:
        mv_a = latest_a.data[0]["model_version"]
        a_res = (
            sb.table("forecast_model_a")
            .select("week_start,weekly_sales_qty_forecast")
            .eq("model_version", mv_a)
            .in_("week_start", targets)
            .execute()
        )
        for r in a_res.data or []:
            w = r["week_start"][:10]
            model_a_totals[w] = model_a_totals.get(w, 0) + float(r["weekly_sales_qty_forecast"] or 0)

    # Model A 판매 예측 참고 MAE (발주 권장 신뢰구간이 아님)
    reference_mae: dict = {
        "overall_sku_week": None,          # SKU×주 단위 평균 MAE
        "winter_sku_week": None,           # 겨울(11~1월) SKU×주 단위 MAE
        "category_weekly_overall": None,   # 카테고리 합산 주간 MAE
        "unit_note": "Model A 판매 예측 MAE이며 발주 권장 오차와 별개",
    }
    notable_cases: list[str] = []
    try:
        latest_run = (
            sb.table("winter_validation").select("run_id,overall_mae,winter_mae")
            .eq("grain", "summary").order("generated_at", desc=True).limit(1).execute()
        )
        if latest_run.data:
            row = latest_run.data[0]
            if row.get("overall_mae") is not None:
                reference_mae["overall_sku_week"] = int(round(float(row["overall_mae"])))
            if row.get("winter_mae") is not None:
                reference_mae["winter_sku_week"] = int(round(float(row["winter_mae"])))

            # weekly grain의 abs_error 평균 (카테고리 합산 주간 MAE)
            wv_weekly = (
                sb.table("winter_validation").select("week_start,actual,predicted,abs_error,error_pct")
                .eq("grain", "weekly").eq("run_id", row["run_id"])
                .execute()
            )
            ws = wv_weekly.data or []
            if ws:
                abs_errs = [float(r["abs_error"]) for r in ws if r.get("abs_error") is not None]
                if abs_errs:
                    reference_mae["category_weekly_overall"] = int(round(sum(abs_errs) / len(abs_errs)))

                # 편차 큰 주차 상위 3개 (±)
                top = sorted(
                    [r for r in ws if r.get("error_pct") is not None],
                    key=lambda r: abs(float(r["error_pct"])),
                    reverse=True,
                )[:3]
                for r in top:
                    actual = int(round(float(r["actual"] or 0)))
                    predicted = int(round(float(r["predicted"] or 0)))
                    pct = float(r["error_pct"])
                    notable_cases.append(
                        f"{r['week_start'][:10]}: 실측 {actual:,} vs 예측 {predicted:,} ({pct:+.0f}%)"
                    )
    except Exception:
        pass

    # 주차별 묶음 구성
    items_by_week: dict[str, list[dict]] = {w: [] for w in targets}
    qty_by_week: dict[str, list[float]] = {w: [] for w in targets}
    for r in sku_res.data or []:
        w = r["week_start"][:10]
        if w not in items_by_week:
            continue
        qty_by_week[w].append(float(r["distributed_qty"] or 0))

    # sku_ratio 재계산(주 내 합 대비)
    result: list[OrderWeeklyItem] = []
    for idx, w in enumerate(targets):
        total_of_week = sum(qty_by_week[w]) or 1
        rows = []
        for r in sku_res.data or []:
            if r["week_start"][:10] != w:
                continue
            qty = int(round(float(r["distributed_qty"] or 0)))
            if qty <= qty_threshold:
                continue
            sku = int(r["sku_id"])
            rows.append({
                "sku": sku,
                "name": name_map.get(sku, f"SKU {sku}"),
                "predicted_order_qty": qty,
                "sku_ratio": round(float(r["distributed_qty"]) / total_of_week, 4),
            })
        # 내림차순 정렬
        rows.sort(key=lambda x: -x["predicted_order_qty"])

        category_total = int(round(cat_map.get(w, 0)))
        model_a_total = int(round(model_a_totals.get(w, 0)))
        ratio_applied = (
            round(category_total / model_a_total, 4) if model_a_total > 0 else 0.0
        )

        result.append(OrderWeeklyItem(
            week_start=w,
            label=labels[idx],
            category_total=category_total,
            model_a_pred_total=model_a_total,
            ratio_applied=ratio_applied,
            reference_mae=reference_mae,
            notable_cases=notable_cases,
            items=rows,
        ))

    return result


@router.get("/weekly-prediction", response_model=list[WeeklyPredictionItem])
def get_weekly_prediction() -> list[WeeklyPredictionItem]:
    """
    주별 예측치 (34 SKU 합산 스케일).

    우선순위:
      1순위 — Supabase winter_validation(grain=weekly 최신 run) + forecast_model_b(카테고리 미래)
      2순위 — 로컬 CSV (winter_analysis_weekly.csv + model_b_category_forecast.csv)
    """
    import pandas as pd

    rows: dict[pd.Timestamp, tuple[int, str]] = {}

    # ── 1순위: Supabase ──
    try:
        sb = _get_supabase_client()
        latest = (
            sb.table("winter_validation").select("run_id")
            .eq("grain", "summary").order("generated_at", desc=True).limit(1).execute()
        )
        if latest.data:
            run_id = latest.data[0]["run_id"]
            wv = (
                sb.table("winter_validation").select("week_start,predicted")
                .eq("grain", "weekly").eq("run_id", run_id)
                .order("week_start").execute()
            )
            for r in wv.data or []:
                ts = pd.Timestamp(r["week_start"])
                rows[ts] = (int(round(float(r["predicted"] or 0))), "supabase_winter_validation")

        winter_max = max(rows.keys()) if rows else pd.Timestamp.min
        fmb = (
            sb.table("forecast_model_b")
            .select("week_start,pred_linear,model_version,generated_at")
            .is_("sku_id", "null").gt("pred_linear", 0)
            .order("generated_at", desc=True).limit(500).execute()
        )
        for r in fmb.data or []:
            ts = pd.Timestamp(r["week_start"])
            if ts > winter_max and ts not in rows:
                rows[ts] = (int(round(float(r["pred_linear"]))), "supabase_forecast_model_b")
    except Exception:
        pass

    # ── 2순위: CSV fallback (Supabase 응답이 비어 있었을 때만) ──
    if not rows:
        winter_path = PROCESSED_DIR / "winter_analysis_weekly.csv"
        winter_max = pd.Timestamp.min
        if winter_path.exists():
            w = pd.read_csv(winter_path, parse_dates=["week_start"])
            for _, r in w.iterrows():
                rows[r["week_start"]] = (int(round(float(r["predicted"]))), "csv_winter_validation")
            winter_max = w["week_start"].max() if not w.empty else winter_max

        b_path = PROCESSED_DIR / "model_b_category_forecast.csv"
        if b_path.exists():
            b = pd.read_csv(b_path, parse_dates=["week_start"])
            b = b[(b["pred_linear"] > 0) & (b["week_start"] > winter_max)]
            for _, r in b.iterrows():
                rows[r["week_start"]] = (int(round(float(r["pred_linear"]))), "csv_model_b_future")

    return [
        WeeklyPredictionItem(
            week_start=ts.strftime("%Y-%m-%d"),
            predicted_qty=qty,
            source=src,
        )
        for ts, (qty, src) in sorted(rows.items())
    ]


@router.get("/winter-analysis", response_model=list[WinterAnalysisItem])
def get_winter_analysis() -> list[WinterAnalysisItem]:
    """
    겨울 검증 결과 (실측 vs 예측, 주차별).

    우선순위:
      1순위 — Supabase winter_validation (grain='weekly', 최신 run_id)
      2순위 — 로컬 CSV (winter_analysis_weekly.csv)
    """
    import pandas as pd

    # ── 1순위: Supabase ──
    try:
        sb = _get_supabase_client()
        latest = (
            sb.table("winter_validation").select("run_id")
            .eq("grain", "summary").order("generated_at", desc=True).limit(1).execute()
        )
        if latest.data:
            run_id = latest.data[0]["run_id"]
            wv = (
                sb.table("winter_validation")
                .select("week_start,actual,predicted,abs_error,error_pct,bias")
                .eq("grain", "weekly").eq("run_id", run_id)
                .order("week_start").execute()
            )
            if wv.data:
                def _label(bias_num):
                    try:
                        v = float(bias_num)
                    except (TypeError, ValueError):
                        return ""
                    if v > 0:
                        return "과소"
                    if v < 0:
                        return "과대"
                    return "일치"

                return [
                    WinterAnalysisItem(
                        week_start=r["week_start"],
                        actual=int(round(float(r["actual"] or 0))),
                        predicted=int(round(float(r["predicted"] or 0))),
                        abs_error=int(round(float(r["abs_error"] or 0))),
                        error_pct=round(float(r["error_pct"] or 0), 1),
                        bias=_label(r.get("bias")),
                    )
                    for r in wv.data
                ]
    except Exception:
        pass

    # ── 2순위: CSV fallback ──
    csv_path = PROCESSED_DIR / "winter_analysis_weekly.csv"
    if not csv_path.exists():
        return []

    df = pd.read_csv(csv_path, parse_dates=["week_start"])
    rows = []
    for _, r in df.iterrows():
        rows.append(WinterAnalysisItem(
            week_start=r["week_start"].strftime("%Y-%m-%d"),
            actual=int(round(float(r["actual"]))),
            predicted=int(round(float(r["predicted"]))),
            abs_error=int(round(float(r["abs_error"]))),
            error_pct=round(float(r["error_pct"]), 1) if not pd.isna(r["error_pct"]) else 0.0,
            bias=str(r["bias"]),
        ))
    return rows


@router.get("/daily-sales", response_model=list[DailySalesItem])
def get_daily_sales(limit: int = Query(default=400, ge=1, le=2000)) -> list[DailySalesItem]:
    """
    daily_performance 테이블에서 34개 핫팩 SKU의 일자별 판매 합계 반환.
    SERVICE_ROLE_KEY로 직접 조회 후 sale_date로 집계.
    """
    try:
        from data_pipeline.weekly_feature_builder import WARMER_SKUS
    except ImportError:
        from services.api.data_pipeline.weekly_feature_builder import WARMER_SKUS

    supabase = _get_supabase_client()
    sku_list = [str(s) for s in WARMER_SKUS]

    all_rows: list[dict[str, Any]] = []
    page_size = 1000
    offset = 0
    while True:
        res = (
            supabase.table("daily_performance")
            .select("sale_date, units_sold, gmv")
            .in_("sku_id", sku_list)
            .order("sale_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if offset > 20000:
            break

    agg: dict[str, dict[str, float]] = {}
    for r in all_rows:
        d = r.get("sale_date")
        if not d:
            continue
        entry = agg.setdefault(d, {"units": 0, "gmv": 0.0})
        entry["units"] += int(r.get("units_sold") or 0)
        entry["gmv"] += float(r.get("gmv") or 0)

    rows = [
        DailySalesItem(sale_date=d, units_sold=int(v["units"]), gmv=round(v["gmv"], 2))
        for d, v in sorted(agg.items(), reverse=True)
    ]
    return rows[:limit]


@router.get("/pack-distribution", response_model=list[PackDistributionItem])
def get_pack_distribution() -> list[PackDistributionItem]:
    """
    카테고리 × 포장 단위별 판매량 집계 (지엘 납품 포장 전환 대비).

    daily_performance에서 vendor_item_name의 "N개" 패턴을 파싱하여
    소비자 구매 옵션별 판매 비중을 계산. 파싱 실패(세트형) 행은 제외.
    """
    import re
    import pandas as pd

    supabase = _get_supabase_client()

    all_rows: list[dict[str, Any]] = []
    offset = 0
    page_size = 1000
    while True:
        res = (
            supabase.table("daily_performance")
            .select("vendor_item_name, units_sold")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        if offset > 30000:
            break

    if not all_rows:
        return []

    df = pd.DataFrame(all_rows)
    df["vendor_item_name"] = df["vendor_item_name"].fillna("")

    def classify(name: str) -> str:
        if any(k in name for k in ("붙이는", "패치", "파스")):
            return "붙이는 핫팩"
        if "찜질" in name:
            return "찜질팩"
        if "손난로" in name or "군인" in name or "보온대" in name:
            return "손난로"
        return "일반 핫팩"

    def parse_pack(name: str) -> int | None:
        name = name.strip()
        m = re.search(r"[,\s](\d+)개\s*$", name)
        if m:
            return int(m.group(1))
        m = re.search(r",(\d+)개", name)
        if m:
            return int(m.group(1))
        return None

    df["category"] = df["vendor_item_name"].apply(classify)
    df["pack_size"] = df["vendor_item_name"].apply(parse_pack)
    df = df.dropna(subset=["pack_size"])
    df["pack_size"] = df["pack_size"].astype(int)
    df["units_sold"] = df["units_sold"].fillna(0).astype(int)

    agg = df.groupby(["category", "pack_size"], as_index=False)["units_sold"].sum()
    cat_totals = agg.groupby("category")["units_sold"].transform("sum")
    agg["pct"] = (agg["units_sold"] / cat_totals * 100).round(2)
    agg = agg.sort_values(["category", "units_sold"], ascending=[True, False])

    return [
        PackDistributionItem(
            category=str(r["category"]),
            pack_size=int(r["pack_size"]),
            units_sold=int(r["units_sold"]),
            pct=float(r["pct"]),
        )
        for _, r in agg.iterrows()
    ]


@router.post("/run", response_model=ForecastRunResponse)
def run_forecast_pipeline_endpoint(req: ForecastRunRequest) -> ForecastRunResponse:
    """
    예측 파이프라인 실행 (weekly_feature_builder → Model A 학습 → forecasts insert).

    - model_kind: lightgbm(권장) | linear
    - val_weeks: 검증 구간 길이(최근 N주)
    - forecast_horizon: 예측 대상 주 수
    - warmers_only: 현재는 True 전용(34 SKU + 보온소품 범위)
    """
    # 지연 import로 FastAPI 부팅 시 무거운 ML 의존성 회피
    try:
        from services.api.analytics.forecast_runner import run_forecast_pipeline
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=f"forecast_runner 로딩 실패: {exc}") from exc

    if not req.warmers_only:
        raise HTTPException(
            status_code=400,
            detail="현재는 warmers_only=True(보온소품 × 34 SKU)만 지원합니다.",
        )

    supabase = _get_supabase_client()
    try:
        result = run_forecast_pipeline(
            supabase,
            model_kind=req.model_kind,
            val_weeks=req.val_weeks,
            forecast_horizon=req.forecast_horizon,
        )
    except ImportError as exc:
        # lightgbm 미설치 등
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"파이프라인 실행 실패: {exc}") from exc

    return ForecastRunResponse(
        status=result.status,
        model_kind=req.model_kind,
        metrics=result.metrics,
        inserted_rows=result.inserted_rows,
        message=(
            f"forecast_rows={result.forecast_rows}, "
            f"skipped_skus={result.skipped_skus}, "
            f"period={result.period}"
            + (f" | {result.message}" if result.message else "")
        ),
    )
