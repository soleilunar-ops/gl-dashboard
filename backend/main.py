"""
대시보드용 API 진입점 초안.

TODO: FastAPI 앱, 라우트 분리, 의존성 주입(설정·데이터 경로), 캐시.
"""

from __future__ import annotations

from .schemas.dashboard_payload import (
    AlertItem,
    BaselineVsActualPoint,
    DashboardResponse,
    InsightContext,
    MarketingEfficiencyRow,
    WeatherTimelinePoint,
)


def build_empty_dashboard_response() -> DashboardResponse:
    """스키마 검증용 빈 응답. KPI·시계열 등은 실데이터 연결 전까지 채우지 않는다."""
    return DashboardResponse(
        kpis={},
        weather_timeline=[],
        baseline_vs_actual=[],
        marketing_efficiency=[],
        alerts=[],
        insight_context=InsightContext(),
    )


if __name__ == "__main__":
    # TODO: uvicorn backend.main:app 형태로 노출 시 FastAPI 앱 추가
    # 실행: 프로젝트 루트에서 `python -m backend.main`
    print(build_empty_dashboard_response().model_dump())
