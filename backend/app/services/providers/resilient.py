"""Resilient provider — tries an ordered chain of providers, falls through on failure.

Default chain is VCI (maintained, primary) → TCBS (legacy fallback). Each method
is independently protected: a failure or empty result on one provider drops to the
next. This is the project's default ``DATA_PROVIDER=resilient``.
"""
from __future__ import annotations

import logging

from app.services.providers.base import DataProvider, FetchedMetrics, FetchedStock

logger = logging.getLogger("vnios.resilient")


class ResilientProvider:
    name = "resilient"

    def __init__(self, chain: list[DataProvider]) -> None:
        if not chain:
            raise ValueError("ResilientProvider requires at least one provider")
        self._chain = chain

    async def fetch_stock_list(self) -> list[FetchedStock]:
        last: Exception | None = None
        for p in self._chain:
            try:
                result = await p.fetch_stock_list()
                if result:
                    logger.info("[OK] stock list via %s (%d)", p.name, len(result))
                    return result
                logger.warning("[EMPTY] stock list via %s — trying next", p.name)
            except Exception as exc:  # noqa: BLE001
                last = exc
                logger.warning("[FALLBACK] %s stock list failed — %s", p.name, exc)
        if last:
            raise last
        return []

    async def fetch_stock_metrics(self, symbol: str) -> FetchedMetrics:
        last: Exception | None = None
        for p in self._chain:
            try:
                m = await p.fetch_stock_metrics(symbol)
                # Treat a result with no usable valuation/profitability as a miss.
                if any(v is not None for v in (m.pe, m.pb, m.roe, m.roa)):
                    return m
                logger.warning("[EMPTY] %s metrics via %s — trying next", symbol, p.name)
            except Exception as exc:  # noqa: BLE001
                last = exc
                logger.warning("[FALLBACK] %s %s metrics failed — %s", p.name, symbol, exc)
        if last:
            raise last
        return FetchedMetrics(symbol=symbol)

    async def fetch_ownership(self, symbol: str) -> list[dict]:
        for p in self._chain:
            if not hasattr(p, "fetch_ownership"):
                continue
            try:
                owners = await p.fetch_ownership(symbol)  # type: ignore[attr-defined]
                if owners:
                    return owners
            except Exception as exc:  # noqa: BLE001
                logger.warning("[FALLBACK] %s ownership failed — %s", p.name, exc)
        return []

    async def fetch_fundamentals(self, symbol: str) -> dict:
        for p in self._chain:
            if not hasattr(p, "fetch_fundamentals"):
                continue
            try:
                f = await p.fetch_fundamentals(symbol)  # type: ignore[attr-defined]
                if f:
                    return f
            except Exception as exc:  # noqa: BLE001
                logger.warning("[FALLBACK] %s fundamentals failed — %s", p.name, exc)
        return {}

    async def fetch_ohlc(self, symbol: str, count: int = 120) -> list[dict]:
        for p in self._chain:
            if not hasattr(p, "fetch_ohlc"):
                continue
            try:
                bars = await p.fetch_ohlc(symbol, count)  # type: ignore[attr-defined]
                if bars:
                    return bars
            except Exception as exc:  # noqa: BLE001
                logger.warning("[FALLBACK] %s ohlc failed — %s", p.name, exc)
        return []

    async def aclose(self) -> None:
        for p in self._chain:
            if hasattr(p, "aclose"):
                await p.aclose()  # type: ignore[attr-defined]
