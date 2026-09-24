"""World-markets connector — global context via Yahoo Finance's public chart API.

Fincept-style aggregation: this is a *free/public* source used for **global context**
panels (world indices, commodities, FX, crypto) in the terminal dashboard. It is a
different data domain than VN equity metrics, so it lives outside the VCI→TCBS chain.

Research-only: neutral numbers (last price + day change), no advice. The pure
``parse_yahoo_chart`` mapper is unit-tested; the HTTP fetch is thin and cached.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.world")

_YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
# Yahoo returns 429 without a browser-ish UA.
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
_CACHE_TTL_SEC = 60.0  # global quotes move slowly enough; be gentle on Yahoo


@dataclass(frozen=True)
class WorldQuote:
    symbol: str
    name: str
    group: str
    price: float | None
    prev_close: float | None
    change: float | None
    change_pct: float | None
    currency: str | None


@dataclass(frozen=True)
class Instrument:
    symbol: str  # Yahoo symbol
    name: str
    group: str


# Curated, modest set — global *context* for a VN-centric research terminal.
INSTRUMENTS: tuple[Instrument, ...] = (
    Instrument("^GSPC", "S&P 500", "Chỉ số"),
    Instrument("^IXIC", "Nasdaq", "Chỉ số"),
    Instrument("^DJI", "Dow Jones", "Chỉ số"),
    Instrument("^N225", "Nikkei 225", "Chỉ số"),
    Instrument("^HSI", "Hang Seng", "Chỉ số"),
    Instrument("^FTSE", "FTSE 100", "Chỉ số"),
    Instrument("GC=F", "Vàng (Gold)", "Hàng hóa"),
    Instrument("CL=F", "Dầu WTI (Crude)", "Hàng hóa"),
    Instrument("DX-Y.NYB", "Chỉ số USD (DXY)", "Tiền tệ"),
    Instrument("BTC-USD", "Bitcoin", "Crypto"),
)

_INDEX = {i.symbol: i for i in INSTRUMENTS}


def _num(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_yahoo_chart(payload: dict, symbol: str, name: str) -> WorldQuote | None:
    """Map a Yahoo v8 ``/chart/{symbol}`` response to a ``WorldQuote``.

    Returns ``None`` when the payload carries no usable last price (Yahoo error,
    empty result, or missing ``regularMarketPrice``). Day change is computed from
    the previous close; if that is absent or zero, ``change``/``change_pct`` stay
    ``None`` rather than fabricating a value.
    """
    if not isinstance(payload, dict):
        return None
    chart = payload.get("chart") or {}
    if chart.get("error"):
        return None
    results = chart.get("result") or []
    if not results:
        return None
    meta = (results[0] or {}).get("meta") or {}

    price = _num(meta.get("regularMarketPrice"))
    if price is None:
        return None
    prev = _num(meta.get("chartPreviousClose"))
    if prev is None:
        prev = _num(meta.get("previousClose"))

    change: float | None = None
    change_pct: float | None = None
    if prev is not None:
        change = round(price - prev, 4)
        if prev != 0:
            change_pct = round((price - prev) / prev * 100, 2)

    group = _INDEX[symbol].group if symbol in _INDEX else "Khác"
    return WorldQuote(
        symbol=symbol,
        name=name,
        group=group,
        price=price,
        prev_close=prev,
        change=change,
        change_pct=change_pct,
        currency=meta.get("currency"),
    )


# --- live fetch (thin, cached) --------------------------------------------------

_cache: dict[str, object] = {"at": 0.0, "quotes": []}


async def _fetch_one(client: httpx.AsyncClient, inst: Instrument) -> WorldQuote | None:
    try:
        resp = await client.get(
            _YAHOO_CHART.format(symbol=inst.symbol),
            params={"interval": "1d", "range": "5d"},
        )
        resp.raise_for_status()
        return parse_yahoo_chart(resp.json(), inst.symbol, inst.name)
    except Exception as exc:  # noqa: BLE001 — one bad symbol must not sink the panel
        logger.warning("[world] %s failed — %s", inst.symbol, exc)
        return None


async def fetch_world_markets(force: bool = False) -> list[WorldQuote]:
    """Fetch all curated instruments concurrently, with a short TTL cache."""
    now = time.time()
    cached = _cache["quotes"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    ) as client:
        results = await asyncio.gather(
            *(_fetch_one(client, inst) for inst in INSTRUMENTS)
        )
    quotes = [q for q in results if q is not None]
    if quotes:  # keep last good snapshot on a total outage
        _cache["quotes"] = quotes
        _cache["at"] = now
    return quotes
