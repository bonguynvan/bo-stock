"""Commodities connector — a fuller basket via Yahoo Finance (no key).

Reuses the world-markets Yahoo parser (like forex). The `world` panel keeps a 2-item
glance (gold + WTI); this is the deep panel: precious/base metals, energy, gas.
Research-only: last price + day change.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, replace

import httpx

from app.config import get_settings
from app.services.world_markets import _UA, _YAHOO_CHART, WorldQuote, parse_yahoo_chart

logger = logging.getLogger("vnios.commodities")

_CACHE_TTL_SEC = 60.0
_GROUP = "Hàng hóa"


@dataclass(frozen=True)
class _Item:
    symbol: str  # Yahoo futures symbol
    name: str


ITEMS: tuple[_Item, ...] = (
    _Item("GC=F", "Vàng (Gold)"),
    _Item("SI=F", "Bạc (Silver)"),
    _Item("HG=F", "Đồng (Copper)"),
    _Item("CL=F", "Dầu WTI"),
    _Item("BZ=F", "Dầu Brent"),
    _Item("NG=F", "Khí tự nhiên"),
)

_cache: dict[str, object] = {"at": 0.0, "quotes": []}


async def _fetch_one(client: httpx.AsyncClient, item: _Item) -> WorldQuote | None:
    try:
        resp = await client.get(
            _YAHOO_CHART.format(symbol=item.symbol),
            params={"interval": "1d", "range": "5d"},
        )
        resp.raise_for_status()
        q = parse_yahoo_chart(resp.json(), item.symbol, item.name)
        return replace(q, group=_GROUP) if q else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("[commodities] %s failed — %s", item.symbol, exc)
        return None


async def fetch_commodities(force: bool = False) -> list[WorldQuote]:
    now = time.time()
    cached = _cache["quotes"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    ) as client:
        results = await asyncio.gather(*(_fetch_one(client, it) for it in ITEMS))

    quotes = [q for q in results if q is not None]
    if quotes:
        _cache["quotes"] = quotes
        _cache["at"] = now
    return quotes
