"""
수요예측 라우터 (담당: 정민)
Prophet / XGBoost 모델을 사용한 품목별 수요 예측 API.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_forecast():
    """수요 예측 결과 조회 (TODO: 모델 연동)"""
    return {"message": "수요예측 엔드포인트 — 구현 예정"}
