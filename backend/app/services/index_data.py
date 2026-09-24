"""Market-index data (VN-Index & co) from KBS + return calculations.

Source (confirmed reachable, not geo-blocked): KBS
``.../iis-server/investment/index/{SYMBOL}/data_day?sdate=&edate=`` → newest-first
daily OHLCV (values mixed str/number). Pure parsers are unit-tested.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IndexBar

logger = logging.getLogger("vnios.index")

_BASE = "https://kbbuddywts.kbsec.com.vn/iis-server/investment/index"
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"

INDICES: tuple[tuple[str, str], ...] = (
    ("VNINDEX", "VN-Index"),
    ("VN30", "VN30"),
    ("HNXINDEX", "HNX-Index"),
)


def _num(x: object) -> float | None:
    if x is None or x == "":
        return None
    try:
        return float(x)  # handles "1860.90" and 1855.67 alike
    except (TypeError, ValueError):
        return None


def parse_index_bars(payload: dict) -> list[dict]:
    """KBS ``data_day`` → [{date, open, high, low, close, volume}] ascending by date."""
    rows = payload.get("data_day") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for r in rows:
        t = str(r.get("t") or "")[:10]
        try:
            d = date.fromisoformat(t)
        except ValueError:
            continue
        close = _num(r.get("c"))
        if close is None:
            continue
        vol = _num(r.get("v"))
        out.append(
            {
                "date": d,
                "open": _num(r.get("o")),
                "high": _num(r.get("h")),
                "low": _num(r.get("l")),
                "close": close,
                "volume": int(vol) if vol is not None else None,
            }
        )
    out.sort(key=lambda x: x["date"])
    return out


async def fetch_index_bars(symbol: str, days: int = 400) -> list[dict]:
    edate = datetime.now().date()
    sdate = edate - timedelta(days=days)
    url = f"{_BASE}/{symbol.upper()}/data_day"
    params = {"sdate": sdate.strftime("%d-%m-%Y"), "edate": edate.strftime("%d-%m-%Y")}
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers={"User-Agent": _UA}) as c:
        r = await c.get(url, params=params)
        r.raise_for_status()
        return parse_index_bars(r.json())


async def sync_index(session: AsyncSession, symbol: str, days: int = 400) -> int:
    """Fetch + upsert daily bars for one index. Returns rows upserted."""
    sym = symbol.upper()
    bars = await fetch_index_bars(sym, days)
    if not bars:
        return 0
    existing = {
        b.date: b
        for b in (
            await session.execute(select(IndexBar).where(IndexBar.symbol == sym))
        ).scalars()
    }
    for b in bars:
        row = existing.get(b["date"])
        if row is None:
            session.add(IndexBar(symbol=sym, **b))
        else:
            for k in ("open", "high", "low", "close", "volume"):
                setattr(row, k, b[k])
    await session.commit()
    logger.info("[index] %s synced %d bars", sym, len(bars))
    return len(bars)


async def _closes(session: AsyncSession, symbol: str) -> list[tuple[date, float]]:
    rows = (
        await session.execute(
            select(IndexBar.date, IndexBar.close)
            .where(IndexBar.symbol == symbol.upper(), IndexBar.close.isnot(None))
            .order_by(IndexBar.date)
        )
    ).all()
    return [(d, c) for d, c in rows]


def _ret(closes: list[tuple[date, float]], since: date) -> float | None:
    """% return from the first bar on/after ``since`` to the latest bar."""
    if not closes:
        return None
    base = next((c for d, c in closes if d >= since), None)
    last = closes[-1][1]
    if not base:
        return None
    return round((last - base) / base * 100, 2)


async def index_summary(session: AsyncSession, symbol: str) -> dict | None:
    """Latest level + standard-period returns for one index."""
    closes = await _closes(session, symbol)
    if not closes:
        return None
    last_date, last = closes[-1]
    prev = closes[-2][1] if len(closes) >= 2 else None
    y0 = date(last_date.year, 1, 1)
    return {
        "symbol": symbol.upper(),
        "level": round(last, 2),
        "change_pct": round((last - prev) / prev * 100, 2) if prev else None,
        "as_of": last_date.isoformat(),
        "ret_1w": _ret(closes, last_date - timedelta(days=7)),
        "ret_1m": _ret(closes, last_date - timedelta(days=30)),
        "ret_3m": _ret(closes, last_date - timedelta(days=91)),
        "ret_ytd": _ret(closes, y0),
        "ret_1y": _ret(closes, last_date - timedelta(days=365)),
        "series": [{"date": d.isoformat(), "close": round(c, 2)} for d, c in closes[-90:]],
    }


async def close_on_or_after(session: AsyncSession, symbol: str, d: date) -> float | None:
    row = (
        await session.execute(
            select(IndexBar.close)
            .where(IndexBar.symbol == symbol.upper(), IndexBar.date >= d, IndexBar.close.isnot(None))
            .order_by(IndexBar.date)
            .limit(1)
        )
    ).scalar_one_or_none()
    return row
