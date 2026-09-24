"""Market-wide factor ranking — value / quality / growth (research-only).

Cross-sectional percentile ranks of each stock's metrics vs the whole universe, combined
into factor scores (0-100) + a composite. Descriptive ranking, not advice. Momentum is
omitted (it would need price history for the whole universe). Pure ``compute_factors`` is
unit-tested; the service assembles the universe from the latest metrics.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Stock, StockMetric
from app.services.screener import _latest_metric_ids


def _percentiles(values: list, higher_better: bool) -> list[float | None]:
    """Percentile rank (0-100) of each value vs the others; None passes through.

    For ``higher_better`` the largest value → 100; otherwise the smallest → 100. Ties
    share the same (average-rank) percentile so a cluster of equal values (e.g. many
    stocks with dividend_yield=0) all score identically. Fewer than 2 comparable values
    → all None (nothing to rank against).
    """
    present = [(i, v) for i, v in enumerate(values) if isinstance(v, (int, float)) and not isinstance(v, bool)]
    out: list[float | None] = [None] * len(values)
    n = len(present)
    if n < 2:
        return out
    order = sorted(present, key=lambda t: t[1])
    k = 0
    while k < n:
        j = k
        while j + 1 < n and order[j + 1][1] == order[k][1]:
            j += 1
        pct = (k + j) / 2 / (n - 1) * 100  # average position of the tie group
        for m in range(k, j + 1):
            out[order[m][0]] = round(pct if higher_better else 100 - pct, 1)
        k = j + 1
    return out


def _avg(vals: list[float | None]) -> float | None:
    xs = [v for v in vals if v is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


def compute_factors(rows: list[dict]) -> list[dict]:
    """Universe rows (metric dicts) → per-stock value/quality/growth/composite (0-100)."""
    def col(key: str) -> list:
        return [r.get(key) for r in rows]

    pe = _percentiles(col("pe"), higher_better=False)
    pb = _percentiles(col("pb"), higher_better=False)
    dy = _percentiles(col("dividend_yield"), higher_better=True)
    roe = _percentiles(col("roe"), higher_better=True)
    roa = _percentiles(col("roa"), higher_better=True)
    nm = _percentiles(col("net_margin"), higher_better=True)
    de = _percentiles(col("debt_equity"), higher_better=False)
    rg = _percentiles(col("revenue_growth"), higher_better=True)
    eg = _percentiles(col("eps_growth"), higher_better=True)

    out: list[dict] = []
    for i, r in enumerate(rows):
        value = _avg([pe[i], pb[i], dy[i]])
        quality = _avg([roe[i], roa[i], nm[i], de[i]])
        growth = _avg([rg[i], eg[i]])
        out.append({
            "symbol": r["symbol"],
            "company_name": r.get("company_name"),
            "industry": r.get("industry"),
            "value": value,
            "quality": quality,
            "growth": growth,
            "composite": _avg([value, quality, growth]),
        })
    out.sort(key=lambda s: (s["composite"] is not None, s["composite"] or 0), reverse=True)
    return out


async def get_factor_ranking(session: AsyncSession) -> list[dict]:
    latest = _latest_metric_ids()
    rows = (
        await session.execute(
            select(
                Stock.symbol, Stock.company_name, Stock.industry,
                StockMetric.pe, StockMetric.pb, StockMetric.dividend_yield,
                StockMetric.roe, StockMetric.roa, StockMetric.net_margin,
                StockMetric.debt_equity, StockMetric.revenue_growth, StockMetric.eps_growth,
            )
            .join(Stock, Stock.symbol == StockMetric.symbol)
            .where(StockMetric.id.in_(latest))
        )
    ).all()
    return compute_factors([r._asdict() for r in rows])
