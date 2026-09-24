"""Sector / industry overview (research-only).

Aggregates the latest per-symbol metrics by industry: how many stocks, total market
cap, and median valuation/profitability. Inspired by vnmarket-stock's sectors page.
Numbers + neutral framing only — no sector calls, no buy/sell.

``avg_change_pct`` depends on the daily price sync (avg_volume/change) which may be
unpopulated (WAF-blocked from non-VN IPs) — it's null until that runs, and the UI
says so rather than showing a misleading 0.
"""
from __future__ import annotations

import statistics

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Stock, StockMetric
from app.services.screener import _latest_metric_ids


def _median(values: list[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(statistics.median(vals), 2) if vals else None


def _mean(values: list[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(statistics.mean(vals), 2) if vals else None


def build_sectors(rows: list[tuple[str | None, int | None, StockMetric]]) -> list[dict]:
    """Group ``(industry, market_cap, metric)`` tuples by industry → aggregates.

    Pure so it is unit-testable without a DB. Rows with no industry are skipped.
    Sorted by total market cap desc (largest sectors first).
    """
    groups: dict[str, list[tuple[int | None, StockMetric]]] = {}
    for industry, market_cap, metric in rows:
        if not industry:
            continue
        groups.setdefault(industry, []).append((market_cap, metric))

    out: list[dict] = []
    for industry, members in groups.items():
        metrics = [m for _, m in members]
        caps = [c for c, _ in members if c is not None]
        out.append(
            {
                "industry": industry,
                "count": len(members),
                "total_market_cap": sum(caps) if caps else None,
                "median_pe": _median([m.pe for m in metrics]),
                "median_pb": _median([m.pb for m in metrics]),
                "median_roe": _median([m.roe for m in metrics]),
                "median_net_margin": _median([m.net_margin for m in metrics]),
                "avg_change_pct": _mean([m.change_pct for m in metrics]),
            }
        )
    out.sort(key=lambda s: (s["total_market_cap"] or 0), reverse=True)
    return out


async def get_sectors_overview(session: AsyncSession) -> dict:
    latest = _latest_metric_ids()
    rows = (
        await session.execute(
            select(Stock.industry, Stock.market_cap, StockMetric)
            .join(Stock, Stock.symbol == StockMetric.symbol)
            .where(StockMetric.id.in_(latest))
        )
    ).all()
    sectors = build_sectors([(r[0], r[1], r[2]) for r in rows])
    has_change = any(s["avg_change_pct"] is not None for s in sectors)
    return {
        "sectors": sectors,
        "count": len(sectors),
        "change_available": has_change,
    }
