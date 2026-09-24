"""VN market pulse — gainers / losers / most-active + breadth (research-only).

Derived from the latest per-symbol metrics (day change + 30d volume). Day-change is
null until the daily price sync runs (WAF-blocked from non-VN IPs); the pure builder
reports ``change_available`` so the UI degrades to a note instead of empty lists.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Stock, StockMetric
from app.services import foreign_stock, prop_trading
from app.services.screener import _latest_metric_ids


def _row(r: dict) -> dict:
    return {
        "symbol": r["symbol"],
        "company_name": r.get("company_name"),
        "close_price": r.get("close_price"),
        "change_pct": r.get("change_pct"),
        "avg_volume_30d": r.get("avg_volume_30d"),
    }


def build_movers(rows: list[dict], n: int = 10) -> dict:
    """Group rows into gainers/losers/most-active + breadth. Pure/testable."""
    changed = [r for r in rows if isinstance(r.get("change_pct"), (int, float))]
    gainers = sorted(
        (r for r in changed if r["change_pct"] > 0), key=lambda r: r["change_pct"], reverse=True
    )[:n]
    losers = sorted(
        (r for r in changed if r["change_pct"] < 0), key=lambda r: r["change_pct"]
    )[:n]
    active = sorted(
        (r for r in rows if isinstance(r.get("avg_volume_30d"), (int, float))),
        key=lambda r: r["avg_volume_30d"],
        reverse=True,
    )[:n]
    advancers = sum(1 for r in changed if r["change_pct"] > 0)
    decliners = sum(1 for r in changed if r["change_pct"] < 0)
    unchanged = sum(1 for r in changed if r["change_pct"] == 0)
    return {
        "gainers": [_row(r) for r in gainers],
        "losers": [_row(r) for r in losers],
        "most_active": [_row(r) for r in active],
        "breadth": {
            "advancers": advancers,
            "decliners": decliners,
            "unchanged": unchanged,
            "total": len(changed),
        },
        "change_available": len(changed) > 0,
    }


async def get_movers(
    session: AsyncSession, n: int = 10, with_foreign: bool = True, with_prop: bool = True
) -> dict:
    latest = _latest_metric_ids()
    rows = (
        await session.execute(
            select(
                Stock.symbol,
                Stock.company_name,
                StockMetric.close_price,
                StockMetric.change_pct,
                StockMetric.avg_volume_30d,
            )
            .join(Stock, Stock.symbol == StockMetric.symbol)
            .where(StockMetric.id.in_(latest))
        )
    ).all()
    data = build_movers([r._asdict() for r in rows], n=n)
    if with_foreign:
        await _attach_flow(data, "foreign_net", foreign_stock.get_many)
    if with_prop:
        await _attach_flow(data, "prop_net", prop_trading.get_many)
    return data


async def _attach_flow(data: dict, field: str, fetch) -> None:
    """Overlay a latest-session net flow (tỷ VND) onto each mover row (best-effort).

    ``field`` is the row key (e.g. ``foreign_net`` / ``prop_net``); ``fetch`` is the
    connector's ``get_many`` returning ``{SYMBOL: {net_val, ...}}``."""
    lists = [data.get("gainers", []), data.get("losers", []), data.get("most_active", [])]
    syms = {row["symbol"] for lst in lists for row in lst}
    fmap = await fetch(sorted(syms)) if syms else {}
    for lst in lists:
        for row in lst:
            row[field] = (fmap.get(row["symbol"]) or {}).get("net_val")
