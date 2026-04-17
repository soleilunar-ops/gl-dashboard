"""
리뷰 분석 라우터 (담당: 나경)
쿠팡 리뷰 데이터 분석 및 인사이트 API.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_reviews_analysis():
    """리뷰 분석 결과 조회 (TODO: 분석 로직 구현)"""
    return {"message": "리뷰 분석 엔드포인트 — 구현 예정"}
