"""Portfolio analytics + market context (research-only).

Combines the index bars (market backdrop + benchmark) with the portfolio: concentration,
sector over/under-weight vs the market, value-weighted quality, best/worst, and a
since-entry vs VN-Index comparison for positions that have an entry date. Describes —
never advises.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MetricHistory, Position
from app.services import index_data, portfolio, sectors

DISCLAIMER = (
    "Phân tích danh mục & bối cảnh thị trường để tham khảo — không phải khuyến nghị "
    "mua/bán. So sánh với VN-Index chỉ mang tính đối chiếu."
)


def _pct(part: float, whole: float) -> float | None:
    return round(part / whole * 100, 2) if whole else None


def _concentration(priced: list[dict]) -> dict:
    weights = sorted((h["weight"] or 0.0 for h in priced), reverse=True)
    return {
        "top1": round(weights[0], 2) if weights else 0.0,
        "top3": round(sum(weights[:3]), 2),
        "hhi": round(sum(w * w for w in weights)),  # 0-10000; >1800 = concentrated
        "positions": len(priced),
    }


def _sector_vs_market(port_alloc: list[dict], sectors_ov: dict) -> list[dict]:
    mkt_total = sum(s["total_market_cap"] or 0 for s in sectors_ov["sectors"])
    mkt_w = (
        {s["industry"]: (s["total_market_cap"] or 0) / mkt_total * 100 for s in sectors_ov["sectors"]}
        if mkt_total
        else {}
    )
    out = []
    for a in port_alloc:
        pw = a["pct"] or 0.0
        mw = round(mkt_w.get(a["label"], 0.0), 2)
        out.append({"label": a["label"], "portfolio_pct": pw, "market_pct": mw,
                    "diff": round(pw - mw, 2)})
    out.sort(key=lambda x: abs(x["diff"]), reverse=True)
    return out


async def _since_entry_alpha(session: AsyncSession, priced: list[dict], vni_level: float | None) -> dict | None:
    """Value-weighted (holding return − VN-Index return) since each position's entry date."""
    if vni_level is None:
        return None
    opened = {
        p.id: p.opened_at
        for p in (await session.execute(select(Position))).scalars()
        if p.opened_at is not None
    }
    num = den = 0.0
    included = 0
    for h in priced:
        od = opened.get(h["id"])
        if od is None or h["pnl_pct"] is None:
            continue
        idx_then = await index_data.close_on_or_after(session, "VNINDEX", od)
        if not idx_then:
            continue
        idx_ret = (vni_level - idx_then) / idx_then * 100
        relative = h["pnl_pct"] - idx_ret
        mv = h["market_value"] or 0
        num += mv * relative
        den += mv
        included += 1
    if included == 0 or den == 0:
        return None
    return {"included": included, "weighted_alpha_pct": round(num / den, 2)}


def _wavg(pairs: list[tuple[float, float | None]]) -> float | None:
    """Value-weighted average over (weight, value) pairs, skipping missing values."""
    num = sum(w * v for w, v in pairs if v is not None and w)
    den = sum(w for w, v in pairs if v is not None and w)
    return round(num / den, 2) if den else None


async def _latest_hist_dividend(session: AsyncSession, symbols: list[str]) -> dict[str, float]:
    """Latest non-null dividend_yield per symbol from metric_history (snapshot is sparse)."""
    if not symbols:
        return {}
    rows = (
        await session.execute(
            select(MetricHistory.symbol, MetricHistory.year, MetricHistory.dividend_yield)
            .where(MetricHistory.symbol.in_(symbols), MetricHistory.dividend_yield.isnot(None))
            .order_by(MetricHistory.symbol, MetricHistory.year)
        )
    ).all()
    out: dict[str, float] = {}
    for sym, _year, dy in rows:  # ordered by year asc → last write per symbol = latest
        out[sym] = dy
    return out


def _income_quality(
    priced: list[dict], total_value: float, sector_alloc: list[dict],
    hist_div: dict[str, float] | None = None,
) -> dict:
    hist_div = hist_div or {}

    def yield_of(h: dict) -> float:
        # snapshot dividend_yield is null/0 for most tickers → fall back to history.
        return h.get("dividend_yield") or hist_div.get(h["symbol"], 0.0) or 0.0

    div = sum(yield_of(h) / 100 * (h["market_value"] or 0) for h in priced)
    flags: list[str] = []
    top = max((h["weight"] or 0 for h in priced), default=0)
    if top > 25:
        heavy = next(h["symbol"] for h in priced if (h["weight"] or 0) == top)
        flags.append(f"Tập trung: {heavy} chiếm {top:.0f}% danh mục (>25%)")
    big_sector = next((s for s in sector_alloc if (s["pct"] or 0) > 40), None)
    if big_sector:
        flags.append(f"Ngành {big_sector['label']} chiếm {big_sector['pct']:.0f}% (>40%)")
    return {
        "expected_annual_dividend": round(div),
        "portfolio_yield_pct": _pct(div, total_value),
        "wavg_pe": _wavg([(h["market_value"] or 0, h.get("pe")) for h in priced if (h.get("pe") or 0) > 0]),
        "wavg_roe": _wavg([(h["market_value"] or 0, h.get("roe")) for h in priced]),
        "solid_count": sum(1 for h in priced if (h.get("compass") or {}).get("long") is not None
                           and h["compass"]["long"] >= 65),
        "risk_flags": flags,
    }


def _pnl_by_sector(priced: list[dict]) -> list[dict]:
    from collections import defaultdict

    pnl: dict[str, float] = defaultdict(float)
    cost: dict[str, float] = defaultdict(float)
    for h in priced:
        if h.get("pnl") is None:
            continue
        key = h.get("industry") or "Không rõ"
        pnl[key] += h["pnl"]
        cost[key] += h["cost_basis"]
    out = [
        {"label": k, "pnl": round(v), "pnl_pct": _pct(v, cost[k])}
        for k, v in pnl.items()
    ]
    out.sort(key=lambda x: x["pnl"], reverse=True)
    return out


async def get_analytics(session: AsyncSession) -> dict:
    market = []
    for sym, _ in index_data.INDICES[:2]:  # VNINDEX + VN30
        s = await index_data.index_summary(session, sym)
        if s:
            market.append(s)

    port = await portfolio.get_analysis(session)
    priced = [h for h in port["holdings"] if h["market_value"]]
    result: dict = {"market": market, "has_portfolio": bool(priced), "disclaimer": DISCLAIMER}
    if not priced:
        return result

    vni = next((m for m in market if m["symbol"] == "VNINDEX"), None)
    sectors_ov = await sectors.get_sectors_overview(session)
    ranked = sorted(
        (h for h in priced if h["pnl_pct"] is not None), key=lambda h: h["pnl_pct"], reverse=True
    )
    cw = [
        (h["market_value"], h["compass"]["long"])
        for h in priced
        if h.get("compass") and h["compass"].get("long") is not None
    ]

    total_value = port["totals"]["market_value"]
    hist_div = await _latest_hist_dividend(session, [h["symbol"] for h in priced])
    result.update(
        {
            "totals": port["totals"],
            "income_quality": _income_quality(priced, total_value, port["allocation_sector"], hist_div),
            "pnl_by_sector": _pnl_by_sector(priced),
            "concentration": _concentration(priced),
            "sector_vs_market": _sector_vs_market(port["allocation_sector"], sectors_ov),
            "avg_compass_long": (
                round(sum(v * s for v, s in cw) / sum(v for v, _ in cw), 1) if cw else None
            ),
            "best": [{"symbol": h["symbol"], "pnl_pct": h["pnl_pct"]} for h in ranked[:3]],
            "worst": [{"symbol": h["symbol"], "pnl_pct": h["pnl_pct"]} for h in ranked[-3:][::-1]],
            "benchmark": {
                "portfolio_return_pct": port["totals"]["pnl_pct"],
                "vnindex_ytd": vni["ret_ytd"] if vni else None,
                "vnindex_1y": vni["ret_1y"] if vni else None,
                "since_entry": await _since_entry_alpha(session, priced, vni["level"] if vni else None),
            },
        }
    )
    return result
