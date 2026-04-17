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

    OpenAI API 키 없으면 룰 기반 fallback 반환.
    """
    try:
        from analytics.insight_generator import (
            build_insight_context_from_local,
            generate_forecast_insight,
        )
    except ImportError:
        from services.api.analytics.insight_generator import (
            build_insight_context_from_local,
            generate_forecast_insight,
        )

    KST = timezone(timedelta(hours=9))
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
    Model B 발주 시뮬레이션 결과 (로컬 CSV 기반).

    data/processed/model_b_sku_distribution.csv에서 미래 주차만 반환.
    """
    csv_path = PROCESSED_DIR / "model_b_sku_distribution.csv"
    if not csv_path.exists():
        return []

    import pandas as pd

    df = pd.read_csv(csv_path, parse_dates=["week_start"])
    KST = timezone(timedelta(hours=9))
    today = datetime.now(KST).date()
    df = df[df["week_start"].dt.date >= today]

    if df.empty:
        return []

    try:
        from data_pipeline.bi_box_loader import build_sku_name_map
        from data_pipeline.weekly_feature_builder import WARMER_SKUS
    except ImportError:
        from services.api.data_pipeline.bi_box_loader import build_sku_name_map
        from services.api.data_pipeline.weekly_feature_builder import WARMER_SKUS

    bi_box_dir = PROJECT_ROOT / "data" / "raw" / "coupang" / "bi_box"
    try:
        name_map = build_sku_name_map(directory=bi_box_dir, skus=WARMER_SKUS)
    except Exception:
        name_map = {}

    rows = []
    for _, r in df.sort_values(["week_start", "predicted_order_qty"], ascending=[True, False]).iterrows():
        sku = int(r["sku"])
        if r["predicted_order_qty"] <= 0:
            continue
        rows.append(OrderSimulationItem(
            week_start=r["week_start"].strftime("%Y-%m-%d"),
            sku=sku,
            name=name_map.get(sku, f"SKU {sku}"),
            predicted_order_qty=int(r["predicted_order_qty"]),
            sku_ratio=round(float(r["sku_ratio"]), 4),
        ))

    return rows[:50]


@router.get("/weekly-prediction", response_model=list[WeeklyPredictionItem])
def get_weekly_prediction() -> list[WeeklyPredictionItem]:
    """
    주별 예측치 (34 SKU 합산 스케일).

    - 과거 구간(검증): winter_analysis_weekly.csv의 predicted (Model A+B 결합)
    - 미래 구간: model_b_category_forecast.csv의 pred_linear > 0인 주차
    두 소스를 week_start 기준으로 병합. 미래가 과거 max 주차보다 큰 것만 채택.
    """
    import pandas as pd

    rows: dict[pd.Timestamp, tuple[int, str]] = {}

    # 1) 과거: winter_analysis_weekly.csv (검증 구간 예측)
    winter_path = PROCESSED_DIR / "winter_analysis_weekly.csv"
    winter_max: pd.Timestamp | None = None
    if winter_path.exists():
        w = pd.read_csv(winter_path, parse_dates=["week_start"])
        for _, r in w.iterrows():
            qty = int(round(float(r["predicted"])))
            rows[r["week_start"]] = (qty, "winter_validation")
        winter_max = w["week_start"].max()

    # 2) 미래: model_b_category_forecast.csv pred_linear (winter_max 이후만)
    b_path = PROCESSED_DIR / "model_b_category_forecast.csv"
    if b_path.exists():
        b = pd.read_csv(b_path, parse_dates=["week_start"])
        b = b[(b["pred_linear"] > 0) & (b["week_start"] > (winter_max or pd.Timestamp.min))]
        for _, r in b.iterrows():
            rows[r["week_start"]] = (int(round(float(r["pred_linear"]))), "model_b_future")

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
    data/processed/winter_analysis_weekly.csv에서 반환.
    """
    import pandas as pd

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
