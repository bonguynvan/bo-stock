"""\"Nền tảng vững\" — surface fundamentally-solid stocks (research-only).

A DB-only universe scan (no live calls, no WAF) that lists stocks passing neutral,
transparent fundamental gates, each shown with the *reasons* it qualifies. This is
NOT advice: it filters + describes so the user can research and choose — it never
says buy/sell and it does not rank one pick as "better to own".

Enabled by the ROE/dividend history now stored per symbol, so consistency ("ROE
positive every year") can be checked without a BCTC.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MetricHistory, Stock, StockMetric
from app.services import dividends, roe_history
from app.services.screener import _latest_metric_ids


@dataclass(frozen=True)
class Gate:
    roe_min: float = 15.0
    debt_equity_max: float = 1.0
    net_margin_min: float = 10.0
    pe_min: float = 5.0
    pe_max: float = 20.0
    market_cap_min: int = 1000  # tỷ VND
    min_history_years: int = 3  # need enough ROE history to judge consistency


BALANCED = Gate()

DISCLAIMER = (
    "Danh sách lọc theo tiêu chí nền tảng cố định để bạn tự nghiên cứu — KHÔNG phải "
    "khuyến nghị mua/bán. Lọc cứng không thay bạn hiểu doanh nghiệp; hãy tự thẩm định."
)


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _valuation_reasonableness(pe: float | None, gate: Gate) -> float:
    """Within the sane PE band, cheaper scores higher (linear pe_min→pe_max = 100→50)."""
    if pe is None:
        return 50.0
    span = gate.pe_max - gate.pe_min
    if span <= 0:
        return 50.0
    return _clamp(100 - (pe - gate.pe_min) / span * 50)


def evaluate(
    metric: dict, roe_stats: dict, div_stats: dict, gate: Gate = BALANCED
) -> dict | None:
    """Score one candidate + build its reasons, or None if it fails a hard gate.

    ``metric``: latest snapshot fields (roe, pe, net_margin, debt_equity, market_cap).
    Pure — no I/O — so it is unit-testable. Hard gates: the balanced thresholds AND
    ROE positive in every history year (the consistency requirement).
    """
    roe = metric.get("roe")
    pe = metric.get("pe")
    nm = metric.get("net_margin")
    de = metric.get("debt_equity")
    mcap = metric.get("market_cap")

    # Hard gates — all must hold.
    if roe is None or roe < gate.roe_min:
        return None
    if de is None or de >= gate.debt_equity_max:
        return None
    if nm is None or nm < gate.net_margin_min:
        return None
    if pe is None or not (gate.pe_min <= pe <= gate.pe_max):
        return None
    if mcap is None or mcap < gate.market_cap_min:
        return None
    if not roe_stats.get("available") or roe_stats["n"] < gate.min_history_years:
        return None
    if roe_stats["positive_years"] < roe_stats["n"]:  # any down year → not "consistent"
        return None

    # Composite fundamental score (transparent weights).
    roe_q = roe_stats["quality_score"]
    lev = _clamp(100 - max(de - 0.3, 0) * 80)
    val = _valuation_reasonableness(pe, gate)
    div = div_stats["score"] if div_stats.get("available") else 0.0
    score = round(roe_q * 0.4 + val * 0.25 + lev * 0.2 + div * 0.15, 1)

    reasons = [
        f"ROE {roe:.0f}% bền ({roe_stats['n']}/{roe_stats['n']} năm dương, "
        f"{roe_stats['trend']})",
        f"Đòn bẩy thấp (Nợ/VCSH {de:.2f})",
        f"Biên LN ròng {nm:.0f}%",
        f"Định giá trong vùng hợp lý (P/E {pe:.1f})",
    ]
    if div_stats.get("available") and div_stats["years_paid"] > 0:
        reasons.append(
            f"Trả cổ tức {div_stats['years_paid']}/{div_stats['n']} năm "
            f"(TB {div_stats['avg_yield']:.1f}%)"
        )

    return {"fundamental_score": score, "reasons": reasons}


async def get_quality_picks(session: AsyncSession, gate: Gate = BALANCED) -> dict:
    """Scan the universe for fundamentally-solid stocks (DB-only). Ranked desc."""
    latest = _latest_metric_ids()
    # SQL pre-filter on the cheap snapshot gates → a small candidate set.
    rows = (
        await session.execute(
            select(Stock, StockMetric)
            .join(StockMetric, Stock.symbol == StockMetric.symbol)
            .where(
                StockMetric.id.in_(latest),
                StockMetric.roe >= gate.roe_min,
                StockMetric.debt_equity < gate.debt_equity_max,
                StockMetric.net_margin >= gate.net_margin_min,
                StockMetric.pe >= gate.pe_min,
                StockMetric.pe <= gate.pe_max,
                Stock.market_cap >= gate.market_cap_min,
            )
        )
    ).all()
    if not rows:
        return {"picks": [], "count": 0, "disclaimer": DISCLAIMER, "criteria": _criteria(gate)}

    symbols = [s.symbol for s, _ in rows]
    hist_rows = (
        await session.execute(
            select(MetricHistory).where(MetricHistory.symbol.in_(symbols))
        )
    ).scalars().all()
    by_symbol: dict[str, list[dict]] = {}
    for h in hist_rows:
        by_symbol.setdefault(h.symbol, []).append(
            {"year": h.year, "roe": h.roe, "dividend_yield": h.dividend_yield}
        )

    picks: list[dict] = []
    for stock, m in rows:
        hist = by_symbol.get(stock.symbol, [])
        rstats = roe_history.roe_stats(hist)
        dstats = dividends.dividend_stats(hist)
        metric = {
            "roe": m.roe, "pe": m.pe, "net_margin": m.net_margin,
            "debt_equity": m.debt_equity, "market_cap": stock.market_cap,
        }
        result = evaluate(metric, rstats, dstats, gate)
        if result is None:
            continue
        picks.append(
            {
                "symbol": stock.symbol,
                "company_name": stock.company_name,
                "industry": stock.industry,
                "market_cap": stock.market_cap,
                "roe": round(m.roe, 1) if m.roe is not None else None,
                "pe": round(m.pe, 1) if m.pe is not None else None,
                "pb": round(m.pb, 2) if m.pb is not None else None,
                "net_margin": round(m.net_margin, 1) if m.net_margin is not None else None,
                "debt_equity": round(m.debt_equity, 2) if m.debt_equity is not None else None,
                "dividend_yield": dstats.get("avg_yield") if dstats.get("available") else None,
                **result,
            }
        )

    picks.sort(key=lambda p: p["fundamental_score"], reverse=True)
    return {
        "picks": picks,
        "count": len(picks),
        "disclaimer": DISCLAIMER,
        "criteria": _criteria(gate),
    }


def _criteria(gate: Gate) -> dict:
    return {
        "roe_min": gate.roe_min,
        "debt_equity_max": gate.debt_equity_max,
        "net_margin_min": gate.net_margin_min,
        "pe_min": gate.pe_min,
        "pe_max": gate.pe_max,
        "market_cap_min": gate.market_cap_min,
    }
