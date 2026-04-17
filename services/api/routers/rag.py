"""
RAG 질의응답 라우터 (담당: PM)
문서 임베딩 기반 질의응답 API. pgvector + LLM 연동.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def query_rag():
    """RAG 질의응답 (TODO: 임베딩 + LLM 파이프라인 구현)"""
    return {"message": "RAG 질의응답 엔드포인트 — 구현 예정"}
