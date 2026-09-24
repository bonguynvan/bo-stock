"""Research assistant — grounded, research-only Q&A (single-user, no auth)."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas.stock import Envelope
from app.services import assistant
from app.services.llm import LLMNotConfigured

router = APIRouter(prefix="/assistant", tags=["assistant"])


class HistoryTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AskRequest(BaseModel):
    question: str
    symbol: str | None = None
    history: list[HistoryTurn] | None = None


@router.get("/status", response_model=Envelope[dict])
async def status() -> Envelope[dict]:
    """Whether the AI assistant is enabled (API key configured)."""
    return Envelope(data={"configured": bool(get_settings().anthropic_api_key)})


@router.post("/ask", response_model=Envelope[dict])
async def ask(body: AskRequest, db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Câu hỏi trống.")
    history = [h.model_dump() for h in body.history] if body.history else None
    try:
        data = await assistant.answer_question(db, body.question, body.symbol, history)
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Lỗi gọi AI: {exc}") from exc
    return Envelope(data=data)
