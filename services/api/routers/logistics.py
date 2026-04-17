"""
물류 데이터 동기화 라우터 (담당: 진희)
쿠팡/이카운트 ERP 데이터를 Supabase와 동기화하는 API.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_sync_status():
    """데이터 동기화 상태 조회 (TODO: 동기화 로직 구현)"""
    return {"message": "물류 동기화 엔드포인트 — 구현 예정"}
