"""
(주)지엘 하루온 스마트 재고시스템 — FastAPI 백엔드
AI/RAG 전용 서버. 단순 CRUD는 프론트에서 Supabase 직접 호출.

실행: uvicorn main:app --reload --port 8000
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import forecast, logistics, rag, reviews, triggers

load_dotenv()

app = FastAPI(
    title="하루온 AI API",
    description="수요예측, 리뷰 분석, RAG 질의응답 등 AI 전용 엔드포인트",
    version="0.1.0",
)

# CORS 설정: .env의 ALLOWED_ORIGINS에서 읽기 (쉼표 구분)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(forecast.router, prefix="/forecast", tags=["수요예측"])
app.include_router(reviews.router, prefix="/reviews", tags=["리뷰분석"])
app.include_router(logistics.router, prefix="/logistics", tags=["물류동기화"])
app.include_router(rag.router, prefix="/rag", tags=["RAG"])
app.include_router(triggers.router, prefix="/triggers", tags=["트리거"])


@app.get("/health")
async def health_check():
    """서버 상태 확인"""
    return {"status": "ok", "service": "하루온 AI API"}
