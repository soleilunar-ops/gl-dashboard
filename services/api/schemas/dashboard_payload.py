"""
대시보드 API 응답 스키마(Pydantic).

구체 KPI 키·비즈니스 임계값은 프론트/기획 확정 전까지 dict·Optional로 둔다.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# 하위 호환용 별칭(필요 시 제거)
KpiBlock = dict[str, Any]

class WeatherTimelinePoint(BaseModel):
    """TODO: Open-Meteo/통합 기준 필드 확정."""

    date: str
    avg_temp: float | None = None
    min_temp: float | None = None
    max_temp: float | None = None
    temp_range: float | None = None
    apparent_temp: float | None = None
    temp_change_vs_prev_day: float | None = None
    coldwave_flag: bool | None = None
    heatwave_flag: bool | None = None


class BaselineVsActualPoint(BaseModel):
    date: str
    sku: str
    actual: float | None = None
    baseline: float | None = None
    residual: float | None = None


class MarketingEfficiencyRow(BaseModel):
    date: str
    sku: str
    marketing_on: int | None = None
    marketing_type: str | None = None
    spend: float | None = None
    actual: float | None = None
    baseline: float | None = None
    marketing_lift: float | None = None
    lift_pct: float | None = None
    lift_per_spend: float | None = None
    incremental_roas: float | None = None


class AlertItem(BaseModel):
    type: str
    severity: str | None = None
    message: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class InsightContext(BaseModel):
    """프론트가 LLM 호출 전에 프리뷰할 수 있는 컨텍스트."""

    schema_version: str | None = None
    payload_ref: str | None = Field(default=None, description="TODO: 스냅샷 id 또는 캐시 키")


class DashboardResponse(BaseModel):
    # 확정 KPI 키 전까지 임의 스키마를 넣지 않기 위해 자유 형태(dict)
    kpis: dict[str, Any] = Field(default_factory=dict)
    weather_timeline: list[WeatherTimelinePoint]
    baseline_vs_actual: list[BaselineVsActualPoint]
    marketing_efficiency: list[MarketingEfficiencyRow]
    alerts: list[AlertItem]
    insight_context: InsightContext
