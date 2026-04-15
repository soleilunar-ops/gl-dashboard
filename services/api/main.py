"""
FastAPI 엔트리포인트.
AI/RAG, 수요 예측 등 ML 관련 API 제공.

실행:
    uvicorn services.api.main:app --reload --port 8000
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# .env 자동 로드 (로컬 개발 편의)
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass

app = FastAPI(title="GL Dashboard API", version="0.1.0")

# CORS 설정 (Next.js 프론트에서 호출 가능하게)
_allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "env": "ok" if os.getenv("SUPABASE_URL") else "missing SUPABASE_URL",
    }


# 라우터 등록
from services.api.routers import forecast as forecast_router  # noqa: E402

app.include_router(forecast_router.router, prefix="/forecast", tags=["forecast"])
