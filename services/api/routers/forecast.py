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
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()


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
    today = datetime.utcnow().date().isoformat()

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


@router.post("/run", response_model=ForecastRunResponse)
def run_forecast_pipeline(req: ForecastRunRequest) -> ForecastRunResponse:
    """
    예측 파이프라인 실행 (학습 + 추론 + forecasts insert).

    TODO(Step 5 완성 시 연결):
    - coupang_performance 조회 → 일→주 집계 → weekly_df
    - weather_data 조회 + 관측소 평균 또는 region 선택
    - feature_engineering 호출
    - weekly_demand_forecast.run_baseline_pipeline 호출
    - forecasts 테이블 insert
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "run_forecast_pipeline 구현 대기 중입니다. "
            "Step 3~5(Supabase 연동 + 주단위 집계 + Model B 신규 구현) 완료 후 활성화됩니다."
        ),
    )
