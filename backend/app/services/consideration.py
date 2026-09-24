"""\"Tóm tắt để cân nhắc\" — synthesize an objective digest from existing data.

Runs AFTER a BCTC analysis, reusing what's already in the DB (BCTC analysis +
merged multi-year trend + valuation + Compass) as a cheap JSON prompt — no PDF, no
extra calls during the BCTC analysis itself. Research-only: objective digest + open
questions, never a buy/sell recommendation.

Degrades gracefully: no valuation → drop valuation_context; no Compass → drop
compass_interpretation (the LLM is told to null them when the input lacks the section).
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, StockMetric
from app.services import compass, llm, news, peers, valuation

logger = logging.getLogger("vnios.consideration")


async def _latest_analyzed(session: AsyncSession, symbol: str) -> Document | None:
    return (
        await session.execute(
            select(Document)
            .where(Document.symbol == symbol.upper(), Document.analysis.isnot(None))
            .order_by(Document.analyzed_at.desc().nullslast(), Document.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _close_price(session: AsyncSession, symbol: str) -> float | None:
    m = (
        await session.execute(
            select(StockMetric)
            .where(StockMetric.symbol == symbol.upper())
            .order_by(StockMetric.report_date.desc().nullslast(), StockMetric.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return m.close_price if m else None


async def build_payload(
    session: AsyncSession, symbol: str, doc: Document, bench: dict | None
) -> dict:
    """Assemble the compact JSON the summarizer reads (only what the spec lists)."""
    sym = symbol.upper()
    analysis = doc.analysis or {}
    # Prefer the annual multi-year series; if only quarterly reports exist, fall back
    # to whatever the latest analyzed report carried (still valid context for a digest).
    merged = await valuation.merged_trend(session, sym, annual_only=True) or analysis.get(
        "multi_year_trend"
    )
    payload: dict = {
        "symbol": sym,
        "current_price": await _close_price(session, sym),
        "bctc_analysis": {
            "key_figures": analysis.get("key_figures"),
            "summary": analysis.get("summary"),
            "yoy_changes": analysis.get("yoy_changes"),
            "risks": analysis.get("risk_flags"),
            "multi_year_trend": merged or analysis.get("multi_year_trend"),
            "ratios": analysis.get("ratios"),
            "cashflow": analysis.get("cashflow"),
            "notes": analysis.get("notes"),
        },
    }

    val = await valuation.get_valuation(session, sym)
    if "error" not in val:
        payload["valuation"] = {
            "methods": val.get("methods"),
            "valuation_range": val.get("valuation_range"),
            "vs_current_price": val.get("vs_current_price"),
            "outliers_excluded": (val.get("earnings_quality") or {}).get("outliers_detected"),
        }

    comp = await compass.get_compass(session, sym)
    if any(comp[h]["score"] is not None for h in ("short_term", "mid_term", "long_term")):
        payload["compass"] = {
            h: {"score": comp[h]["score"], "breakdown": comp[h]["breakdown"]}
            for h in ("short_term", "mid_term", "long_term")
        }
    if bench:
        payload["industry_comparison"] = {
            "industry": bench["industry"],
            "peer_count": bench["peer_count"],
            "metrics": [
                {"label": m["label"], "value": m["value"], "median": m["median"],
                 "percentile": m["percentile"]}
                for m in bench["metrics"]
            ],
            "peers": bench["peers"][:5],
        }

    # Recent news headlines (titles only — cheap) so the digest is aware of current
    # developments the financials can't show. Best-effort; empty on fetch failure.
    try:
        items = await news.symbol_news(sym, limit=8)
        if items:
            payload["recent_news"] = [
                {"title": n["title"], "source": n["source"], "published": n["published_iso"]}
                for n in items[:8]
            ]
    except Exception as exc:  # noqa: BLE001 — never fail the digest over news
        logger.warning("[consideration] news for %s failed — %s", sym, exc)
    return payload


async def generate(session: AsyncSession, symbol: str, force: bool = False) -> dict | None:
    """Generate + store the digest on the latest analyzed doc. None if none analyzed.

    Cache guard: returns the stored digest (no AI) unless ``force``.
    """
    doc = await _latest_analyzed(session, symbol)
    if doc is None:
        return None
    if doc.consideration_summary is not None and not force:
        return doc.consideration_summary

    bench = await peers.industry_benchmark(session, symbol)
    payload = await build_payload(session, symbol, doc, bench)
    summary = await llm.summarize_for_consideration(payload)
    # The comparison TABLE is deterministic (from our DB) — attach it, don't let the AI
    # invent it. The AI still references the numbers in strengths/concerns via the payload.
    summary["industry_comparison"] = bench  # None when no peers → frontend hides it
    doc.consideration_summary = summary
    await session.commit()
    return summary


async def get_stored(session: AsyncSession, symbol: str) -> dict | None:
    """The latest analyzed doc's stored digest, if any (no AI)."""
    doc = await _latest_analyzed(session, symbol)
    return doc.consideration_summary if doc else None
