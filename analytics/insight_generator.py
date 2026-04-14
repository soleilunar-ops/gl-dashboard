"""
OpenAI API로 넘길 컨텍스트 조립(호출은 backend 계층에서 수행 권장).

Julius AI는 코드에 통합하지 않는다. EDA용 질문 목록은 TODO로 문서화.
"""

from __future__ import annotations

from typing import Any


def build_openai_insight_context(
    dashboard_payload: dict[str, Any],
    *,
    max_rows_sample: int | None = 20,
) -> dict[str, Any]:
    """
    LLM 입력용 JSON. 민감정보·과대 토큰 방지 정책은 TODO.

    Args:
        dashboard_payload: `DashboardResponse` 직렬화 형태와 동일 키를 권장.
        max_rows_sample: 시계열 일부만 포함할 경우 상한.
    """
    ctx: dict[str, Any] = {
        "schema_version": "TODO: 시맨틱 버저닝 확정",
        "kpis": dashboard_payload.get("kpis"),
        "weather_summary": dashboard_payload.get("weather_timeline"),
        "baseline_vs_actual_head": (dashboard_payload.get("baseline_vs_actual") or [])[: max_rows_sample or 0],
        "marketing_efficiency_head": (dashboard_payload.get("marketing_efficiency") or [])[: max_rows_sample or 0],
        "alerts": dashboard_payload.get("alerts"),
        "notes": "TODO: PII 마스킹, 토큰 예산, 한국어 출력 포맷 지시문은 호출측 system prompt에서 관리",
    }
    return ctx


EDA_QUESTIONS_TODO: list[str] = [
    "TODO(Julius/노트북): 일교차(temp_range)와 판매량의 계절별 관계 시각화",
    "TODO: marketing_on=0 서브샘플에서 기온·요일 조건부 분포 점검",
    "TODO: 지역별판매트렌드와 기상 그리드 조인 민감도",
]
