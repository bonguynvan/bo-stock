"""Portfolio analysis (research-only): current value, unrealized P&L, allocation.

Reuses the synced snapshot (close_price, industry, exchange) + cached Compass scores.
Describes the portfolio — it never advises buy/sell or executes anything.
"""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CompassScore, Position, Stock, StockMetric
from app.services.screener import _latest_metric_ids

DISCLAIMER = (
    "Danh mục do bạn tự nhập để theo dõi & nghiên cứu — công cụ KHÔNG kết nối tài "
    "khoản, KHÔNG đặt lệnh, KHÔNG khuyến nghị mua/bán. Lãi/lỗ là tạm tính theo giá "
    "đóng cửa gần nhất đã đồng bộ."
)


def _pct(part: float, whole: float) -> float | None:
    return round(part / whole * 100, 2) if whole else None


async def get_analysis(session: AsyncSession) -> dict:
    stmt = select(Position).order_by(Position.created_at)
    positions = (await session.execute(stmt)).scalars().all()
    if not positions:
        return {
            "holdings": [], "unpriced": [], "disclaimer": DISCLAIMER,
            "allocation_sector": [], "allocation_exchange": [],
            "totals": {"market_value": 0.0, "cost_basis": 0.0, "pnl": 0.0,
                       "pnl_pct": None, "positions": 0, "priced": 0},
        }

    syms = sorted({p.symbol for p in positions})
    latest = _latest_metric_ids()
    metric_rows = (
        await session.execute(
            select(Stock, StockMetric)
            .join(StockMetric, Stock.symbol == StockMetric.symbol)
            .where(Stock.symbol.in_(syms), StockMetric.id.in_(latest))
        )
    ).all()
    info = {s.symbol: (s, m) for s, m in metric_rows}
    compass = {
        c.symbol: {"short": c.short_score, "mid": c.mid_score, "long": c.long_score}
        for c in (
            await session.execute(select(CompassScore).where(CompassScore.symbol.in_(syms)))
        ).scalars()
    }

    holdings: list[dict] = []
    unpriced: list[str] = []
    total_value = total_cost = 0.0
    for p in positions:
        stock, metric = info.get(p.symbol, (None, None))
        price = metric.close_price if metric else None
        cost_basis = p.avg_cost * p.quantity
        market_value = price * p.quantity if price else None
        pnl = market_value - cost_basis if market_value is not None else None
        if price is None:
            unpriced.append(p.symbol)
        total_value += market_value or 0.0
        total_cost += cost_basis
        holdings.append(
            {
                "id": p.id, "symbol": p.symbol,
                "company_name": stock.company_name if stock else None,
                "industry": stock.industry if stock else None,
                "exchange": stock.exchange if stock else None,
                "quantity": p.quantity, "avg_cost": p.avg_cost, "price": price,
                "dividend_yield": metric.dividend_yield if metric else None,
                "pe": metric.pe if metric else None,
                "roe": metric.roe if metric else None,
                "market_value": round(market_value) if market_value is not None else None,
                "cost_basis": round(cost_basis),
                "pnl": round(pnl) if pnl is not None else None,
                "pnl_pct": _pct(pnl, cost_basis) if pnl is not None else None,
                "weight": None,  # filled below once total is known
                "compass": compass.get(p.symbol),
                "note": p.note,
            }
        )

    for h in holdings:
        h["weight"] = _pct(h["market_value"], total_value) if h["market_value"] else None

    return {
        "holdings": holdings,
        "totals": {
            "market_value": round(total_value),
            "cost_basis": round(total_cost),
            "pnl": round(total_value - total_cost),
            "pnl_pct": _pct(total_value - total_cost, total_cost),
            "positions": len(positions),
            "priced": len(positions) - len(unpriced),
        },
        "allocation_sector": _allocate(holdings, "industry", total_value),
        "allocation_exchange": _allocate(holdings, "exchange", total_value),
        "unpriced": unpriced,
        "disclaimer": DISCLAIMER,
    }


def _allocate(holdings: list[dict], key: str, total: float) -> list[dict]:
    """Group priced holdings by a field → value + % of portfolio, desc."""
    buckets: dict[str, list[float]] = defaultdict(list)
    for h in holdings:
        if h["market_value"]:
            buckets[h.get(key) or "Không rõ"].append(h["market_value"])
    out = [
        {"label": label, "value": round(sum(vals)), "pct": _pct(sum(vals), total),
         "count": len(vals)}
        for label, vals in buckets.items()
    ]
    out.sort(key=lambda x: x["value"], reverse=True)
    return out
