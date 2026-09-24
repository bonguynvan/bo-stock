"""Market + per-stock news from public RSS feeds (research-only).

Sources are globally-reachable RSS (no geo-block, no token): CafeF for market news,
Google News search for per-symbol news. We only relay headlines + links to the
original source — no editorializing, no buy/sell. Results are TTL-cached to avoid
hammering the feeds.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import httpx

logger = logging.getLogger("vnios.news")

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
_MARKET_FEEDS = (
    ("CafeF", "https://cafef.vn/thi-truong-chung-khoan.rss"),
    ("Vietstock", "https://vietstock.vn/145/chung-khoan.rss"),
)

# Multi-source news channels (Fincept-style RSS aggregation). Each channel fans out
# over several public feeds; one bad feed degrades to empty (parse_rss / _cached).
_CHANNELS: dict[str, tuple[str, tuple[tuple[str, str], ...]]] = {
    "vn": ("Việt Nam", _MARKET_FEEDS),
    "world": (
        "Thế giới",
        (
            ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
            ("MarketWatch", "http://feeds.marketwatch.com/marketwatch/topstories/"),
            ("Investing", "https://www.investing.com/rss/news_25.rss"),
        ),
    ),
    "macro": (
        "Vĩ mô",
        (
            ("CNBC Economy", "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
            ("Investing Economy", "https://www.investing.com/rss/news_95.rss"),
        ),
    ),
}
_TTL = 900  # 15 min
_cache: dict[str, tuple[float, list[dict]]] = {}
_TAG = re.compile(r"<[^>]+>")


def _iso(pubdate: str) -> str | None:
    try:
        return parsedate_to_datetime(pubdate).isoformat()
    except (TypeError, ValueError):
        return None


def parse_rss(xml_text: str, default_source: str | None = None, limit: int = 30) -> list[dict]:
    """Parse an RSS feed → [{title, link, published, published_iso, source, summary}].

    Pure. Tolerates the CDATA/namespaced variants across CafeF / Vietstock / GNews.
    """
    text = (xml_text or "").lstrip("﻿").strip()
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []
    out: list[dict] = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not title or not link:
            continue
        pub = (it.findtext("pubDate") or "").strip()
        desc = it.findtext("description") or ""
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else None
        out.append(
            {
                "title": title,
                "link": link,
                "published": pub,
                "published_iso": _iso(pub),
                "source": source or default_source,
                "summary": _TAG.sub("", desc).strip()[:220],
            }
        )
        if len(out) >= limit:
            break
    return out


async def _fetch(url: str) -> str:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"User-Agent": _UA}) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.text


async def _cached(key: str, url: str, source: str | None, limit: int) -> list[dict]:
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < _TTL:
        return hit[1]
    try:
        items = parse_rss(await _fetch(url), default_source=source, limit=limit)
    except (httpx.HTTPError, Exception) as exc:  # noqa: BLE001 - never crash the caller
        logger.warning("[news] fetch %s failed — %s", url, exc)
        return hit[1] if hit else []  # serve stale on failure
    _cache[key] = (now, items)
    return items


async def market_news(limit: int = 30) -> list[dict]:
    """Aggregate market news across feeds, newest first, deduped by title."""
    collected: list[dict] = []
    for source, url in _MARKET_FEEDS:
        collected.extend(await _cached(f"market:{source}", url, source, limit))
    seen: set[str] = set()
    uniq = [x for x in collected if not (x["title"] in seen or seen.add(x["title"]))]
    uniq.sort(key=lambda x: x.get("published_iso") or "", reverse=True)
    return uniq[:limit]


def list_channels() -> list[dict]:
    """Available news channels for the terminal (key + label)."""
    return [{"key": k, "label": label} for k, (label, _feeds) in _CHANNELS.items()]


async def channel_news(channel: str, limit: int = 30) -> list[dict]:
    """Aggregate one channel's feeds, newest first, deduped by title. [] if unknown."""
    ch = _CHANNELS.get(channel)
    if ch is None:
        return []
    _label, feeds = ch
    collected: list[dict] = []
    for source, url in feeds:
        collected.extend(await _cached(f"ch:{channel}:{source}", url, source, limit))
    seen: set[str] = set()
    uniq = [x for x in collected if not (x["title"] in seen or seen.add(x["title"]))]
    uniq.sort(key=lambda x: x.get("published_iso") or "", reverse=True)
    return uniq[:limit]


async def search_news(query: str, limit: int = 6) -> list[dict]:
    """Google News RSS search for an arbitrary Vietnamese query (TTL-cached)."""
    q = quote(query.strip())
    url = f"https://news.google.com/rss/search?q={q}&hl=vi&gl=VN&ceid=VN:vi"
    return await _cached(f"q:{query.strip().lower()}", url, None, limit)


async def symbol_news(symbol: str, limit: int = 20) -> list[dict]:
    """Per-symbol news via Google News RSS search (Vietnamese)."""
    return await search_news(f"{symbol.upper()} cổ phiếu", limit)


async def personalized_news(
    symbols: list[str], per_symbol: int = 3, limit: int = 40
) -> list[dict]:
    """Merge per-symbol news across the user's Portfolio + Watchlist symbols.

    Concurrent (each symbol_news is TTL-cached), deduped by link, newest-first, each
    item tagged with its ``symbol``. Symbols are capped so the fan-out stays bounded.
    """
    syms = list(dict.fromkeys(s.upper() for s in symbols if s))[:15]
    if not syms:
        return []
    batches = await asyncio.gather(
        *(symbol_news(s, limit=per_symbol) for s in syms), return_exceptions=True
    )
    merged: list[dict] = []
    seen: set[str] = set()
    for sym, items in zip(syms, batches):
        if isinstance(items, Exception):
            continue
        for it in items[:per_symbol]:
            if it["link"] in seen:
                continue
            seen.add(it["link"])
            merged.append({**it, "symbol": sym})
    merged.sort(key=lambda x: x.get("published_iso") or "", reverse=True)
    return merged[:limit]
