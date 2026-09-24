"""TCBS public-API provider.

NOTE: ``apipubaws.tcbs.com.vn`` is geo-restricted to Vietnam; from other regions
the gateway returns ``404 Service not found``. The network code below is written
to the documented public endpoints and will work from a Vietnamese IP. The pure
mapping functions are testable independently of the network.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import date

import httpx

from app.config import get_settings
from app.services.providers.base import FetchedMetrics, FetchedStock

logger = logging.getLogger("vnios.tcbs")


def _num(value: object) -> float | None:
    """Best-effort numeric coercion; returns None for missing/blank values."""
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _pct(value: object) -> float | None:
    """TCBS ratios come as fractions (0.228) → percent (22.8)."""
    n = _num(value)
    return round(n * 100, 2) if n is not None else None


# ----------------------------- pure mappers ------------------------------- #

def map_listing(payload: dict | list) -> list[FetchedStock]:
    """Map the stock-listing payload into FetchedStock rows."""
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    out: list[FetchedStock] = []
    for r in rows or []:
        symbol = (r.get("ticker") or r.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        out.append(
            FetchedStock(
                symbol=symbol,
                company_name=r.get("organShortName")
                or r.get("companyName")
                or r.get("organName"),
                exchange=(r.get("exchange") or r.get("comGroupCode") or "").upper()
                or None,
                industry=r.get("icbName") or r.get("industryName") or r.get("industry"),
            )
        )
    return out


def map_financial_ratio(payload: list | dict, symbol: str) -> FetchedMetrics:
    """Map the financialratio payload (list of period records) for one symbol.

    Uses the most recent record for point-in-time ratios and derives YoY growth
    against the same quarter of the prior year when available.
    """
    records = payload.get("data", payload) if isinstance(payload, dict) else payload
    records = records or []
    if not records:
        return FetchedMetrics(symbol=symbol)

    # Newest first (TCBS returns descending; sort defensively).
    records = sorted(
        records,
        key=lambda r: (_num(r.get("year")) or 0, _num(r.get("quarter")) or 0),
        reverse=True,
    )
    latest = records[0]

    rd: date | None = None
    yr, q = _num(latest.get("year")), _num(latest.get("quarter"))
    if yr:
        month = int((q or 4) * 3)
        rd = date(int(yr), min(month, 12), 1)

    m = FetchedMetrics(
        symbol=symbol,
        report_date=rd,
        period="quarterly" if q else "yearly",
        pe=_num(latest.get("priceToEarning")),
        pb=_num(latest.get("priceToBook")),
        ev_ebitda=_num(latest.get("valueBeforeEbitda")),
        roe=_pct(latest.get("roe")),
        roa=_pct(latest.get("roa")),
        gross_margin=_pct(latest.get("grossProfitMargin")),
        net_margin=_pct(latest.get("postTaxMargin")),
        debt_equity=_num(latest.get("debtOnEquity")),
        current_ratio=_num(latest.get("currentPayment")),
        eps_trailing=_num(latest.get("earningPerShare")),
        dividend_yield=_pct(latest.get("dividend")),
    )

    # YoY growth: same quarter, prior year.
    if yr and q:
        prior = next(
            (
                r
                for r in records
                if _num(r.get("year")) == yr - 1 and _num(r.get("quarter")) == q
            ),
            None,
        )
        if prior:
            m.eps_growth = _yoy(latest.get("earningPerShare"), prior.get("earningPerShare"))
            m.revenue_growth = _yoy(latest.get("revenue"), prior.get("revenue"))
            m.profit_growth = _yoy(
                latest.get("postTaxProfit"), prior.get("postTaxProfit")
            )
    return m


def _yoy(curr: object, prev: object) -> float | None:
    c, p = _num(curr), _num(prev)
    if c is None or p in (None, 0):
        return None
    return round((c - p) / abs(p) * 100, 2)  # type: ignore[operator]


def merge_overview(m: FetchedMetrics, overview: dict | None) -> FetchedMetrics:
    """Fold the ticker overview payload (price, market cap, charter capital)."""
    if not overview:
        return m
    o = overview.get("data", overview) if isinstance(overview, dict) else overview
    m.close_price = _num(o.get("price")) or m.close_price
    m.change_pct = _pct(o.get("priceChangeRatio")) or m.change_pct
    mc = _num(o.get("marketCap"))
    if mc is not None:
        m.charter_capital = m.charter_capital or int(_num(o.get("charterCapital")) or 0) or None
    return m


# ----------------------------- provider impl ------------------------------ #

class _RateLimiter:
    """Token-ish limiter capping requests per second across coroutines."""

    def __init__(self, per_sec: int) -> None:
        self._min_interval = 1.0 / max(1, per_sec)
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._min_interval - (now - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()


class TCBSProvider:
    name = "tcbs"

    def __init__(self) -> None:
        s = get_settings()
        self._base = s.tcbs_base_url.rstrip("/")
        self._timeout = s.http_timeout
        self._retries = s.http_max_retries
        self._limiter = _RateLimiter(s.http_rate_limit_per_sec)
        self._headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
            ),
            "Referer": s.tcbs_referer,
            "Accept": "application/json",
        }

    async def _get_json(self, client: httpx.AsyncClient, path: str) -> dict | list:
        url = f"{self._base}{path}"
        last_exc: Exception | None = None
        for attempt in range(1, self._retries + 1):
            await self._limiter.acquire()
            try:
                resp = await client.get(url, headers=self._headers, timeout=self._timeout)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001 - retry on any transport/HTTP error
                last_exc = exc
                logger.warning("[RETRY %d/%d] %s — %s", attempt, self._retries, url, exc)
                await asyncio.sleep(attempt)  # linear backoff
        raise RuntimeError(f"TCBS request failed after {self._retries} retries: {url}") from last_exc

    async def fetch_stock_list(self) -> list[FetchedStock]:
        async with httpx.AsyncClient() as client:
            payload = await self._get_json(
                client, "/stock-insight/v1/stock/listing"
            )
        return map_listing(payload)

    async def fetch_stock_metrics(self, symbol: str) -> FetchedMetrics:
        symbol = symbol.upper()
        async with httpx.AsyncClient() as client:
            ratio = await self._get_json(
                client, f"/tcanalysis/v1/finance/{symbol}/financialratio?yearly=0&isAll=false"
            )
            metrics = map_financial_ratio(ratio, symbol)
            try:
                overview = await self._get_json(
                    client, f"/tcanalysis/v1/ticker/{symbol}/overview"
                )
                metrics = merge_overview(metrics, overview)  # type: ignore[arg-type]
            except Exception as exc:  # noqa: BLE001 - overview is optional enrichment
                logger.warning("[WARN] %s overview unavailable — %s", symbol, exc)
        return metrics
