"""Signal radar — the Giai đoạn 1 → Giai đoạn 2 bridge.

Takes the stocks flagged by the forensic/QoE synthesis (elevated_risk / watch conviction,
weak QoE, or high Beneish) and overlays cheap recent-news presence (latest headline + count
from the RSS relay — NO LLM), so you can see which suspect names are in the news right now.
The full AI news-signal classification stays per-stock/on-demand in the detail panel.

Deterministic + cheap: one DB pass over the latest `fraud_scores`, then a bounded, concurrent
news fetch for the top-N flagged. Research-only: it surfaces risk-screening signals, no advice.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FraudScore, Stock
from app.services import conviction, foreign_stock, news, prop_trading, valuation

_NEWS_PER_SYMBOL = 5
_DEFAULT_LIMIT = 20
_MAX_LIMIT = 40


def _severity(overall: str, qoe_flag: str | None, beneish_flag: str | None) -> int:
    """Rank a flagged stock (higher = more urgent). 0 = not flagged (excluded)."""
    if overall == "elevated_risk":
        return 3
    if overall == "watch":
        return 2
    if qoe_flag == "weak" or beneish_flag == "high_risk":
        return 1  # a single quality/manipulation flag, even if overall isn't elevated
    return 0


def flag_reasons(
    overall: str, qoe_flag: str | None, beneish_flag: str | None, altman_zone: str | None
) -> list[str]:
    """Human-readable reasons a stock is on the radar (always ≥1 when flagged)."""
    r: list[str] = []
    if beneish_flag == "high_risk":
        r.append("Beneish: rủi ro thao túng cao")
    if qoe_flag == "weak":
        r.append("Chất lượng lợi nhuận thấp")
    if altman_zone == "distress":
        r.append("Altman Z'': vùng nguy hiểm")
    if not r:  # overall watch/elevated without a specific axis above
        r.append("Hồ sơ tin cậy: cần lưu ý")
    return r


async def _news_map(symbols: list[str]) -> dict[str, dict]:
    """Latest headline + recent count per symbol (concurrent, cached RSS). Best-effort."""
    batches = await asyncio.gather(
        *(news.symbol_news(s, limit=_NEWS_PER_SYMBOL) for s in symbols), return_exceptions=True
    )
    out: dict[str, dict] = {}
    for sym, items in zip(symbols, batches):
        if isinstance(items, Exception) or not items:
            out[sym] = {"news_count": 0, "latest_news": None}
            continue
        top = items[0]
        out[sym] = {
            "news_count": len(items),
            "latest_news": {
                "title": top.get("title"), "link": top.get("link"),
                "published": top.get("published_iso"), "source": top.get("source"),
            },
        }
    return out


async def _attach_news(items: list[dict]) -> None:
    """Overlay news onto radar rows in place (the all-in-one get_radar path)."""
    m = await _news_map([it["symbol"] for it in items])
    for it in items:
        d = m.get(it["symbol"]) or {}
        it["news_count"] = d.get("news_count", 0)
        it["latest_news"] = d.get("latest_news")


async def get_flow_overlays(
    symbols: list[str], with_news: bool = True, with_foreign: bool = True, with_prop: bool = True,
) -> dict[str, dict]:
    """Network overlays (news / foreign / tự doanh) for a symbol list — the progressive
    second-pass the radar fetches AFTER rendering its DB-only rows. Concurrent + best-effort.
    Returns ``{SYMBOL: {foreign_net, prop_net, news_count, latest_news}}``."""
    syms = list(dict.fromkeys(s.strip().upper() for s in symbols if s and s.strip()))
    if not syms:
        return {}
    jobs: list[tuple[str, object]] = []
    if with_news:
        jobs.append(("news", _news_map(syms)))
    if with_foreign:
        jobs.append(("foreign", foreign_stock.get_many(syms)))
    if with_prop:
        jobs.append(("prop", prop_trading.get_many(syms)))
    results = await asyncio.gather(*(j[1] for j in jobs), return_exceptions=True)
    by = {name: (res if isinstance(res, dict) else {}) for (name, _), res in zip(jobs, results)}
    news_m, fmap, pmap = by.get("news", {}), by.get("foreign", {}), by.get("prop", {})
    return {
        s: {
            "foreign_net": (fmap.get(s) or {}).get("net_val"),
            "prop_net": (pmap.get(s) or {}).get("net_val"),
            "news_count": (news_m.get(s) or {}).get("news_count", 0),
            "latest_news": (news_m.get(s) or {}).get("latest_news"),
        }
        for s in syms
    }


async def scan_coverage(session: AsyncSession) -> dict:
    """How much of the universe the forensic scan has actually covered.

    A short radar can mean "few risks" OR "thin scan coverage" — surfacing scanned/total
    lets the reader tell them apart (no silent cap). ``scanned`` = distinct symbols with a
    fraud score; ``total`` = listed stocks."""
    scanned = (
        await session.execute(select(func.count(func.distinct(FraudScore.symbol))))
    ).scalar_one()
    total = (await session.execute(select(func.count(Stock.symbol)))).scalar_one()
    return {"scanned": int(scanned or 0), "total": int(total or 0)}


async def flagged_among(session: AsyncSession, symbols: list[str]) -> list[dict]:
    """Which of ``symbols`` are currently on the risk radar (deterministic, no news).

    Powers the "followed symbols that are flagged" alert — cheap and instant."""
    syms = sorted({s.strip().upper() for s in symbols if s and s.strip()})
    if not syms:
        return []
    latest_ids = select(func.max(FraudScore.id)).group_by(FraudScore.symbol).scalar_subquery()
    rows = (
        await session.execute(
            select(Stock, FraudScore)
            .join(FraudScore, FraudScore.symbol == Stock.symbol)
            .where(FraudScore.id.in_(latest_ids), FraudScore.symbol.in_(syms))
        )
    ).all()
    out: list[dict] = []
    for stock, f in rows:
        overall = conviction.overall_from_scores(
            beneish_flag=f.beneish_flag, altman_zone=f.altman_em_zone,
            piotroski_score=f.piotroski_fscore, qoe_flag=f.earnings_quality_flag,
            qoe_score=f.earnings_quality_score,
        )
        sev = _severity(overall, f.earnings_quality_flag, f.beneish_flag)
        if sev == 0:
            continue
        out.append({
            "symbol": stock.symbol,
            "company_name": stock.company_name,
            "conviction_overall": overall,
            "earnings_quality_flag": f.earnings_quality_flag,
            "beneish_flag": f.beneish_flag,
            "altman_em_zone": f.altman_em_zone,
            "reasons": flag_reasons(overall, f.earnings_quality_flag, f.beneish_flag, f.altman_em_zone),
            "_sev": sev,
        })
    out.sort(key=lambda x: x["_sev"], reverse=True)
    for it in out:
        del it["_sev"]
    return out


async def get_radar(
    session: AsyncSession, limit: int = _DEFAULT_LIMIT, with_news: bool = True,
    with_foreign: bool = True, with_prop: bool = True, with_valuation: bool = True,
) -> list[dict]:
    """Flagged stocks (severity, then market cap) + news + foreign/prop/valuation overlays.

    Market-wide conviction radar: the forensic/QoE flag sets who's on it; the valuation
    pillar (cheap/fair/rich vs sector) + foreign/tự doanh flow overlay corroborate."""
    limit = max(1, min(limit, _MAX_LIMIT))
    latest_ids = select(func.max(FraudScore.id)).group_by(FraudScore.symbol).scalar_subquery()
    rows = (
        await session.execute(
            select(Stock, FraudScore)
            .join(FraudScore, FraudScore.symbol == Stock.symbol)
            .where(FraudScore.id.in_(latest_ids))
        )
    ).all()

    flagged: list[dict] = []
    for stock, f in rows:
        overall = conviction.overall_from_scores(
            beneish_flag=f.beneish_flag,
            altman_zone=f.altman_em_zone,
            piotroski_score=f.piotroski_fscore,
            qoe_flag=f.earnings_quality_flag,
            qoe_score=f.earnings_quality_score,
        )
        sev = _severity(overall, f.earnings_quality_flag, f.beneish_flag)
        if sev == 0:
            continue
        flagged.append({
            "symbol": stock.symbol,
            "company_name": stock.company_name,
            "industry": stock.industry,
            "market_cap": stock.market_cap,
            "conviction_overall": overall,
            "earnings_quality_flag": f.earnings_quality_flag,
            "earnings_quality_score": f.earnings_quality_score,
            "beneish_flag": f.beneish_flag,
            "altman_em_zone": f.altman_em_zone,
            "period": f.period,
            "_sev": sev,
        })

    flagged.sort(key=lambda x: (x["_sev"], x["market_cap"] or 0), reverse=True)
    flagged = flagged[:limit]
    for it in flagged:
        del it["_sev"]

    if flagged:
        await _apply_overlays(session, flagged, with_news, with_foreign, with_prop, with_valuation)
    return flagged


async def _apply_overlays(
    session: AsyncSession, flagged: list[dict], with_news: bool, with_foreign: bool,
    with_prop: bool, with_valuation: bool,
) -> None:
    """Run the independent overlays (news / foreign / tự doanh / valuation) CONCURRENTLY.

    They don't depend on each other, so wall-clock = the slowest overlay (tự doanh's
    per-symbol fetch), not the sum. Only the valuation overlay touches the DB session, so
    there's no session-concurrency conflict. Each overlay is best-effort (a failure leaves
    its field unset rather than breaking the radar)."""
    syms = [it["symbol"] for it in flagged]
    jobs: list[tuple[str, object]] = []
    if with_news:
        jobs.append(("news", _attach_news(flagged)))
    if with_foreign:
        jobs.append(("foreign", foreign_stock.get_many(syms)))
    if with_prop:
        jobs.append(("prop", prop_trading.get_many(syms)))
    if with_valuation:
        jobs.append(("valuation", valuation.batch_sector_relative(session, syms)))
    if not jobs:
        return

    results = await asyncio.gather(*(j[1] for j in jobs), return_exceptions=True)
    by_name = {name: res for (name, _), res in zip(jobs, results)}

    fmap = by_name.get("foreign")
    if isinstance(fmap, dict):
        for it in flagged:
            it["foreign_net"] = (fmap.get(it["symbol"]) or {}).get("net_val")
    pmap = by_name.get("prop")
    if isinstance(pmap, dict):
        for it in flagged:
            it["prop_net"] = (pmap.get(it["symbol"]) or {}).get("net_val")
    vmap = by_name.get("valuation")
    if isinstance(vmap, dict):
        for it in flagged:
            v = vmap.get(it["symbol"]) or {}
            it["valuation_flag"] = v.get("valuation_flag", "unknown")
            it["valuation_premium_pct"] = v.get("premium_pct")
