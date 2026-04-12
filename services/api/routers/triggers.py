"""
트리거 라우터 (담당: PM)
재고 부족 알림, 스케줄 작업 등 이벤트 기반 처리 API.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_trigger_status():
    """트리거 상태 조회 (TODO: 알림/스케줄 로직 구현)"""
    return {"message": "트리거 엔드포인트 — 구현 예정"}
