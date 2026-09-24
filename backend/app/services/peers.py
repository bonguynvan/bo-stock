"""Peer / industry comparison (research-only).

For a stock, compare each key metric against the latest metrics of every stock in
the same industry: median, quartiles, range, and where the stock sits (percentile).
Pure stats + neutral numbers — no buy/sell judgement.
"""
from __future__ import annotations

import statistics

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Stock, StockMetric
from app.services.screener import _latest_metric_ids

# (key, label, higher_is_better) — higher_is_better drives neutral UI phrasing only.
METRICS: tuple[tuple[str, str, bool], ...] = (
    ("pe", "P/E", False),
    ("pb", "P/B", False),
    ("roe", "ROE %", True),
    ("roa", "ROA %", True),
    ("net_margin", "Biên LN ròng %", True),
    ("debt_equity", "Nợ/Vốn CSH", False),
)


def metric_stats(values: list[float | None], target: float | None) -> dict:
    """Distribution stats over peer ``values`` + where ``target`` falls."""
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    if n == 0:
        return {"n": 0, "median": None, "p25": None, "p75": None,
                "min": None, "max": None, "percentile": None}
    median = statistics.median(vals)
    if n >= 4:
        q = statistics.quantiles(vals, n=4)  # [p25, p50, p75]
        p25, p75 = q[0], q[2]
    else:
        p25, p75 = vals[0], vals[-1]
    percentile = None
    if target is not None:
        # share of peers strictly below this stock's value (0-100)
        percentile = round(sum(1 for v in vals if v < target) / n * 100)
    return {
        "n": n,
        "median": round(median, 2),
        "p25": round(p25, 2),
        "p75": round(p75, 2),
        "min": round(vals[0], 2),
        "max": round(vals[-1], 2),
        "percentile": percentile,
    }


async def get_peer_comparison(session: AsyncSession, symbol: str) -> dict:
    sym = symbol.upper()
    stock = await session.get(Stock, sym)
    if stock is None:
        return {"error": f"Không tìm thấy mã '{sym}'."}
    if not stock.industry:
        return {"error": "Mã này chưa có thông tin ngành để so sánh."}

    latest = _latest_metric_ids()
    rows = (
        await session.execute(
            select(StockMetric)
            .join(Stock, Stock.symbol == StockMetric.symbol)
            .where(Stock.industry == stock.industry, StockMetric.id.in_(latest))
        )
    ).scalars().all()

    target_row = next((m for m in rows if m.symbol == sym), None)
    metrics = []
    for key, label, higher_is_better in METRICS:
        values = [getattr(m, key) for m in rows]
        target = getattr(target_row, key, None) if target_row else None
        stats = metric_stats(values, target)
        metrics.append(
            {
                "key": key,
                "label": label,
                "higher_is_better": higher_is_better,
                "value": round(target, 2) if target is not None else None,
                **stats,
            }
        )

    return {
        "industry": stock.industry,
        "peer_count": len(rows),
        "metrics": metrics,
    }


# Benchmark metrics injected into BCTC analysis + the digest (key, label, higher_is_better).
_BENCH_METRICS: tuple[tuple[str, str, bool], ...] = (
    ("pe", "P/E", False),
    ("pb", "P/B", False),
    ("roe", "ROE %", True),
    ("roa", "ROA %", True),
    ("gross_margin", "Biên LN gộp %", True),
    ("net_margin", "Biên LN ròng %", True),
    ("debt_equity", "Nợ/Vốn CSH", False),
)


async def industry_benchmark(session: AsyncSession, symbol: str) -> dict | None:
    """Same-industry medians + this stock's value/percentile + top peers (from our DB).

    Returns None when the stock has no industry or no peers with data. Used to give the
    BCTC analysis + the digest REAL industry numbers instead of a placeholder.
    """
    sym = symbol.upper()
    stock = await session.get(Stock, sym)
    if stock is None or not stock.industry:
        return None

    latest = _latest_metric_ids()
    rows = (
        await session.execute(
            select(Stock, StockMetric)
            .join(StockMetric, Stock.symbol == StockMetric.symbol)
            .where(Stock.industry == stock.industry, StockMetric.id.in_(latest))
        )
    ).all()
    if len(rows) < 2:
        return None

    target = next((m for s, m in rows if m.symbol == sym), None)
    metrics = []
    for key, label, hib in _BENCH_METRICS:
        vals = sorted(getattr(m, key) for _, m in rows if getattr(m, key) is not None)
        if not vals:
            continue
        tval = getattr(target, key, None) if target else None
        pct = (
            round(sum(1 for v in vals if v < tval) / len(vals) * 100)
            if tval is not None
            else None
        )
        metrics.append(
            {
                "key": key,
                "label": label,
                "higher_is_better": hib,
                "value": round(tval, 2) if tval is not None else None,
                "median": round(statistics.median(vals), 2),
                "n": len(vals),
                "percentile": pct,
            }
        )

    peers = sorted(
        ((s, m) for s, m in rows if m.symbol != sym),
        key=lambda sm: sm[0].market_cap or 0,
        reverse=True,
    )[:8]
    peer_list = [
        {
            "symbol": s.symbol,
            "company_name": s.company_name,
            "market_cap": s.market_cap,
            "pe": round(m.pe, 2) if m.pe is not None else None,
            "pb": round(m.pb, 2) if m.pb is not None else None,
            "roe": round(m.roe, 1) if m.roe is not None else None,
            "roa": round(m.roa, 1) if m.roa is not None else None,
            "net_margin": round(m.net_margin, 1) if m.net_margin is not None else None,
        }
        for s, m in peers
    ]
    return {
        "industry": stock.industry,
        "peer_count": len(rows),
        "metrics": metrics,
        "peers": peer_list,
    }


def benchmark_context_text(bench: dict) -> str:
    """A compact Vietnamese line of industry medians for the analysis prompt."""
    parts = [f"{m['label']} {m['median']}" for m in bench.get("metrics", [])]
    return (
        f"SỐ LIỆU TRUNG BÌNH NGÀNH '{bench['industry']}' "
        f"(trung vị, {bench['peer_count']} mã cùng ngành): " + "; ".join(parts) + "."
    )
