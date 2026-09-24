"""Research assistant — grounded Q&A over the app's own data (research-only).

The model answers ONLY from the JSON context we assemble for a symbol (metrics,
fraud/strength scores, Compass) — it extracts, explains, and compares numbers. The
system prompt forbids buy/sell/hold, price targets, or any recommendation, matching
the standing research-only scope. AI runs only on an explicit user question.
"""
from __future__ import annotations

import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import FraudScore
from app.services import compass, peers
from app.services.llm import LLMNotConfigured  # reuse the not-configured signal
from app.services.stock_service import metrics_for_symbols

_MAX_HISTORY = 6  # last 3 exchanges kept for follow-up context

logger = logging.getLogger("vnios.assistant")

DISCLAIMER = (
    "Trợ lý chỉ trích xuất & giải thích dữ liệu sẵn có để bạn tự nghiên cứu — "
    "không phải khuyến nghị mua/bán. Hãy tự kiểm chứng trước khi quyết định."
)

ASSISTANT_SYSTEM = (
    "Bạn là TRỢ LÝ NGHIÊN CỨU cho một công cụ chứng khoán Việt Nam. Chỉ trả lời dựa "
    "trên DỮ LIỆU JSON được cung cấp — trích xuất, giải thích, so sánh số liệu và nêu "
    "bối cảnh. Trả lời bằng tiếng Việt, ngắn gọn, luôn dẫn số cụ thể từ dữ liệu.\n\n"
    "TUYỆT ĐỐI KHÔNG:\n"
    "- khuyến nghị mua / bán / nắm giữ, không đưa giá mục tiêu, không lời khuyên đầu tư;\n"
    "- không kết luận đóng kiểu \"nên / không nên / đáng mua / tránh xa\";\n"
    "- không bịa số không có trong dữ liệu — nếu thiếu dữ liệu, nói rõ \"dữ liệu chưa đủ\".\n\n"
    "Khi phù hợp, gợi ý người dùng tự kiểm chứng thêm (BCTC, tin tức). Kết thúc câu trả "
    "lời trung tính, để người đọc tự quyết định."
)


def build_user_content(question: str, context: dict) -> str:
    """Assemble the user message: the grounding JSON + the question. Pure/testable."""
    return (
        "DỮ LIỆU (JSON) để trả lời — chỉ dùng dữ liệu này, không suy diễn ngoài nó:\n"
        + json.dumps(context, ensure_ascii=False, default=str)
        + "\n\nCÂU HỎI:\n"
        + question.strip()
    )


def build_messages(history: list[dict] | None, question: str, context: dict) -> list[dict]:
    """Claude messages: prior turns (capped) + the current question with grounding.

    Only well-formed user/assistant turns are carried; the current question always
    ends the list as a user turn (grounding JSON attached). Pure/testable.
    """
    msgs: list[dict] = []
    for h in (history or [])[-_MAX_HISTORY:]:
        role = h.get("role")
        content = (h.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        # Enforce strict alternation: drop any consecutive same-role turn (Claude
        # rejects two user (or two assistant) turns in a row).
        if msgs and msgs[-1]["role"] == role:
            continue
        msgs.append({"role": role, "content": [{"type": "text", "text": content}]})
    # The current question is a user turn, so history must not end on one.
    if msgs and msgs[-1]["role"] == "user":
        msgs.pop()
    msgs.append(
        {"role": "user", "content": [{"type": "text", "text": build_user_content(question, context)}]}
    )
    return msgs


async def gather_context(db: AsyncSession, symbol: str | None) -> dict:
    """Collect compact grounding data for a symbol (metrics + fraud + Compass)."""
    if not symbol:
        return {"note": "Không có mã cụ thể — trả lời dựa trên hiểu biết chung, không có số liệu riêng."}
    sym = symbol.strip().upper()
    ctx: dict = {"symbol": sym}

    rows = await metrics_for_symbols(db, [sym])
    if rows:
        ctx["metrics"] = rows[0].model_dump()

    fraud = (
        await db.execute(
            select(FraudScore).where(FraudScore.symbol == sym).order_by(FraudScore.period.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if fraud is not None:
        ctx["fraud_strength"] = {
            "period": fraud.period,
            "beneish_mscore": fraud.beneish_mscore,
            "beneish_flag": fraud.beneish_flag,
            "altman_em_zone": fraud.altman_em_zone,
            "piotroski_fscore": fraud.piotroski_fscore,
        }

    scores = await compass.get_scores_batch(db, [sym])
    if scores.get(sym):
        ctx["compass"] = scores[sym]

    peer_cmp = await peers.get_peer_comparison(db, sym)
    if isinstance(peer_cmp, dict) and "error" not in peer_cmp:
        ctx["peers"] = peer_cmp
    return ctx


async def answer_question(
    db: AsyncSession,
    question: str,
    symbol: str | None,
    history: list[dict] | None = None,
) -> dict:
    """Answer a research question grounded in the symbol's data. 503 if no API key.

    ``history`` carries prior {role, content} turns so follow-ups keep context.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LLMNotConfigured(
            "ANTHROPIC_API_KEY chưa được cấu hình. Đặt biến môi trường để bật trợ lý AI."
        )

    context = await gather_context(db, symbol)
    body = {
        "model": settings.anthropic_model,
        "max_tokens": 2000,
        "system": ASSISTANT_SYSTEM,
        "messages": build_messages(history, question, context),
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.anthropic_base_url}/v1/messages", json=body, headers=headers
        )
        resp.raise_for_status()
        data = resp.json()

    usage = data.get("usage", {}) or {}
    logger.info(
        "[assistant] %s: input=%d output=%d",
        symbol or "?", usage.get("input_tokens", 0), usage.get("output_tokens", 0),
    )
    answer = "".join(
        b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
    ).strip()
    return {
        "answer": answer,
        "symbol": context.get("symbol"),
        "sources": [k for k in ("metrics", "fraud_strength", "compass", "peers") if k in context],
        "model": settings.anthropic_model,
        "disclaimer": DISCLAIMER,
    }


__all__ = [
    "answer_question",
    "gather_context",
    "build_user_content",
    "build_messages",
    "DISCLAIMER",
]
