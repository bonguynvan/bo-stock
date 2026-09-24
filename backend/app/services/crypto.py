"""Crypto connector — CoinGecko's free public markets API (no key required).

Fincept-style aggregation of a free/public source. Research-only: last price +
24h change + market cap, no advice. Pure ``parse_coingecko_markets`` is unit-tested.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.crypto")

_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets"
# CoinGecko ids for a modest, well-known basket.
_IDS = ("bitcoin", "ethereum", "binancecoin", "solana", "ripple", "cardano")
_CACHE_TTL_SEC = 60.0


@dataclass(frozen=True)
class CryptoQuote:
    symbol: str
    name: str
    price: float | None
    change_pct: float | None  # 24h
    market_cap: int | None


def _num(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_coingecko_markets(payload: object) -> list[CryptoQuote]:
    """Map CoinGecko ``/coins/markets`` (a list) to ``CryptoQuote`` rows.

    Rows without a usable ``current_price`` are skipped. ``price_change_percentage_24h``
    is preserved as ``None`` when absent rather than coerced to zero.
    """
    if not isinstance(payload, list):
        return []
    out: list[CryptoQuote] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        price = _num(row.get("current_price"))
        if price is None:
            continue
        cap = _num(row.get("market_cap"))
        out.append(
            CryptoQuote(
                symbol=(row.get("symbol") or "").upper(),
                name=row.get("name") or "",
                price=price,
                change_pct=_num(row.get("price_change_percentage_24h")),
                market_cap=int(cap) if cap is not None else None,
            )
        )
    return out


_cache: dict[str, object] = {"at": 0.0, "quotes": []}


async def fetch_crypto_markets(force: bool = False) -> list[CryptoQuote]:
    now = time.time()
    cached = _cache["quotes"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
            resp = await client.get(
                _MARKETS_URL,
                params={
                    "vs_currency": "usd",
                    "ids": ",".join(_IDS),
                    "order": "market_cap_desc",
                    "price_change_percentage": "24h",
                },
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            quotes = parse_coingecko_markets(resp.json())
    except Exception as exc:  # noqa: BLE001
        logger.warning("[crypto] fetch failed — %s", exc)
        return list(cached)  # type: ignore[arg-type]

    if quotes:
        _cache["quotes"] = quotes
        _cache["at"] = now
    return quotes
