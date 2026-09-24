"""Forex connector — major FX pairs via Yahoo Finance's public chart API (no key).

Reuses the world-markets Yahoo parser; only the instrument set + grouping differ.
Research-only: last rate + day change. VN-relevant pairs (USD/VND first).
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, replace

import httpx

from app.config import get_settings
from app.services.world_markets import (
    _UA,
    _YAHOO_CHART,
    WorldQuote,
    parse_yahoo_chart,
)

logger = logging.getLogger("vnios.forex")

_CACHE_TTL_SEC = 60.0
_GROUP = "Tiền tệ"


@dataclass(frozen=True)
class _Pair:
    symbol: str  # Yahoo FX symbol
    name: str


# Yahoo FX convention: "XXX=X" = USD/XXX; "AAABBB=X" = AAA/BBB.
PAIRS: tuple[_Pair, ...] = (
    _Pair("VND=X", "USD/VND"),
    _Pair("EURUSD=X", "EUR/USD"),
    _Pair("JPY=X", "USD/JPY"),
    _Pair("CNY=X", "USD/CNY"),
    _Pair("GBPUSD=X", "GBP/USD"),
)

_cache: dict[str, object] = {"at": 0.0, "quotes": []}


async def _fetch_one(client: httpx.AsyncClient, pair: _Pair) -> WorldQuote | None:
    try:
        resp = await client.get(
            _YAHOO_CHART.format(symbol=pair.symbol),
            params={"interval": "1d", "range": "5d"},
        )
        resp.raise_for_status()
        q = parse_yahoo_chart(resp.json(), pair.symbol, pair.name)
        return replace(q, group=_GROUP) if q else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("[forex] %s failed — %s", pair.symbol, exc)
        return None


async def fetch_forex(force: bool = False) -> list[WorldQuote]:
    now = time.time()
    cached = _cache["quotes"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    ) as client:
        results = await asyncio.gather(*(_fetch_one(client, p) for p in PAIRS))

    quotes = [q for q in results if q is not None]
    if quotes:
        _cache["quotes"] = quotes
        _cache["at"] = now
    return quotes
