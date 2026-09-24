"""News signals — structured events + sentiment from recent per-stock headlines.

Giai đoạn 2 (alt-data / signals) opener: turns the free-form Google-News RSS headlines
(``news.symbol_news``) into structured signals (event type + sentiment + a neutral
1-line extract) via the LLM. Research-only: it CLASSIFIES what the news says, treats it
as unverified, and never recommends. AI runs only on an explicit user request (the panel's
button) — a short TTL cache avoids re-paying on a re-open. The event types
(insider_shareholder, regulatory_legal, earnings…) are exactly what can corroborate a
Giai đoạn 1 forensic red flag.
"""
from __future__ import annotations

import time

from app.services import llm, news

_TTL = 1800.0  # 30 min
_MAX_ITEMS = 15
_cache: dict[str, tuple[float, dict]] = {}


async def get_news_signals(symbol: str, force: bool = False) -> dict:
    """Fetch recent headlines and classify them. Cached per symbol (TTL).

    Raises LLMNotConfigured / AnalysisParseError / httpx.HTTPError from the LLM call —
    the router maps them to 503 / 502."""
    sym = symbol.upper()
    now = time.time()
    hit = _cache.get(sym)
    if not force and hit and now - hit[0] < _TTL:
        return hit[1]

    items = await news.symbol_news(sym, limit=_MAX_ITEMS)
    if not items:
        return {"available": False, "symbol": sym,
                "note": "Không tìm thấy tin gần đây cho mã này."}

    result = await llm.classify_news_signals(sym, items)
    result.update({"available": True, "symbol": sym, "analyzed_count": len(items)})
    _cache[sym] = (now, result)
    return result
