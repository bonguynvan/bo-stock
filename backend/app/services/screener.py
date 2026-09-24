"""Screener query: filter + rank stocks by their latest metrics."""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CompassScore, FraudScore, MetricHistory, Stock, StockMetric
from app.schemas.screener import ScreenerRequest
from app.schemas.stock import StockResult
from app.services import conviction, dividends, roe_history
from app.services.scoring import score_to_grade


def _compass_long_from_history(hist: list[dict]) -> float | None:
    """Compass long-term from metric_history alone (roe_quality 0.35 + dividend 0.15,
    missing-weight redistributed). Mirrors compass.get_compass's long WITHOUT the
    BCTC financial-quality component — so it's computable universe-wide, no AI."""
    rs = roe_history.roe_stats(hist)
    ds = dividends.dividend_stats(hist)
    parts: list[tuple[float, float]] = []
    if rs.get("available"):
        parts.append((rs["quality_score"], 0.35))
    if ds.get("available"):
        parts.append((ds["score"], 0.15))
    if not parts:
        return None
    tw = sum(w for _, w in parts)
    return round(sum(s * w for s, w in parts) / tw, 1)


async def _attach_compass_long(session: AsyncSession, results: list[StockResult]) -> None:
    """Fill compass_long on each result: cached CompassScore.long (fuller, includes
    BCTC quality) if present, else computed DB-only from metric_history."""
    syms = [r.symbol for r in results]
    if not syms:
        return
    cached = {
        c.symbol: c.long_score
        for c in (
            await session.execute(select(CompassScore).where(CompassScore.symbol.in_(syms)))
        ).scalars()
        if c.long_score is not None
    }
    missing = [s for s in syms if s not in cached]
    by_sym: dict[str, list[dict]] = defaultdict(list)
    if missing:
        rows = (
            await session.execute(
                select(MetricHistory).where(MetricHistory.symbol.in_(missing))
            )
        ).scalars().all()
        for h in rows:
            by_sym[h.symbol].append(
                {"year": h.year, "roe": h.roe, "dividend_yield": h.dividend_yield}
            )
    for r in results:
        r.compass_long = (
            cached.get(r.symbol)
            if r.symbol in cached
            else _compass_long_from_history(by_sym.get(r.symbol, []))
        )

# Clean-P/E bounds for the historical average (drop loss-year / depressed-earnings P/E).
_HIST_PE_MIN, _HIST_PE_MAX, _HIST_MIN_YEARS = 0.0, 60.0, 3


def _latest_metric_ids() -> Select:
    """Subquery: the newest metric row id per symbol."""
    return select(func.max(StockMetric.id)).group_by(StockMetric.symbol).scalar_subquery()


def _avg_hist_pe_sq():
    """Subquery: mean P/E per symbol across clean history years (≥3 years)."""
    return (
        select(
            MetricHistory.symbol.label("symbol"),
            func.avg(MetricHistory.pe).label("avg_pe"),
        )
        .where(MetricHistory.pe > _HIST_PE_MIN, MetricHistory.pe < _HIST_PE_MAX)
        .group_by(MetricHistory.symbol)
        .having(func.count() >= _HIST_MIN_YEARS)
        .subquery()
    )


def _pe_vs_hist(current_pe: float | None, avg_pe: float | None) -> float | None:
    if current_pe is None or current_pe <= 0 or not avg_pe:
        return None
    return round((current_pe - avg_pe) / avg_pe * 100, 1)


def _row_to_result(stock: Stock, m: StockMetric, avg_pe: float | None = None) -> StockResult:
    return StockResult(
        symbol=stock.symbol,
        company_name=stock.company_name,
        exchange=stock.exchange,
        industry=stock.industry,
        market_cap=stock.market_cap,
        close_price=m.close_price,
        change_pct=m.change_pct,
        pe=m.pe,
        pb=m.pb,
        roe=m.roe,
        roa=m.roa,
        net_margin=m.net_margin,
        revenue_growth=m.revenue_growth,
        eps_growth=m.eps_growth,
        debt_equity=m.debt_equity,
        current_ratio=m.current_ratio,
        dividend_yield=m.dividend_yield,
        avg_volume_30d=m.avg_volume_30d,
        pe_vs_hist=_pe_vs_hist(m.pe, avg_pe),
        quant_score=m.quant_score,
        quant_grade=score_to_grade(m.quant_score),
        updated_at=m.created_at.isoformat() if m.created_at else None,
    )


# sort_by name → ORM column (Stock.market_cap lives on Stock, rest on StockMetric)
def _sort_column(name: str):
    if name == "market_cap":
        return Stock.market_cap
    return getattr(StockMetric, name, StockMetric.quant_score)


def _filter_conditions(req: ScreenerRequest) -> list:
    """Build SQL filter conditions from the request (shared by count + page)."""
    conds = []
    if req.sector:
        conds.append(Stock.industry == req.sector)
    if req.exchange:
        conds.append(Stock.exchange.in_([e.upper() for e in req.exchange]))
    if req.market_cap_min is not None:
        conds.append(Stock.market_cap >= req.market_cap_min)
    if req.pe_max is not None:
        conds.append(StockMetric.pe <= req.pe_max)
        conds.append(StockMetric.pe > 0)  # exclude loss-making / null
    if req.pb_max is not None:
        conds.append(StockMetric.pb <= req.pb_max)
    if req.roe_min is not None:
        conds.append(StockMetric.roe >= req.roe_min)
    if req.roa_min is not None:
        conds.append(StockMetric.roa >= req.roa_min)
    if req.revenue_growth_min is not None:
        conds.append(StockMetric.revenue_growth >= req.revenue_growth_min)
    if req.avg_volume_30d_min is not None:
        conds.append(StockMetric.avg_volume_30d >= req.avg_volume_30d_min)
    if req.debt_equity_max is not None:
        conds.append(StockMetric.debt_equity <= req.debt_equity_max)
    if req.dividend_yield_min is not None:
        conds.append(StockMetric.dividend_yield >= req.dividend_yield_min)
    if req.exclude_beneish_high_risk:
        conds.append(
            Stock.symbol.notin_(
                select(FraudScore.symbol).where(FraudScore.beneish_flag == "high_risk")
            )
        )
    if req.exclude_weak_earnings_quality:
        conds.append(
            Stock.symbol.notin_(
                select(FraudScore.symbol).where(FraudScore.earnings_quality_flag == "weak")
            )
        )
    return conds


async def _attach_fraud_fields(session: AsyncSession, results: list[StockResult]) -> None:
    """Attach Beneish flag + Quality-of-Earnings flag/score from the latest FraudScore."""
    syms = [r.symbol for r in results]
    if not syms:
        return
    by_sym = {
        f.symbol: f
        for f in (
            await session.execute(
                select(FraudScore)
                .where(FraudScore.symbol.in_(syms))
                .order_by(FraudScore.symbol, FraudScore.period)  # latest period wins the dict
            )
        ).scalars()
    }
    for r in results:
        f = by_sym.get(r.symbol)
        if f is not None:
            r.beneish_flag = f.beneish_flag
            r.earnings_quality_flag = f.earnings_quality_flag
            r.earnings_quality_score = f.earnings_quality_score
            r.conviction_overall = conviction.overall_from_scores(
                beneish_flag=f.beneish_flag,
                altman_zone=f.altman_em_zone,  # Z'' (emerging markets) is primary for VN
                piotroski_score=f.piotroski_fscore,
                qoe_flag=f.earnings_quality_flag,
                qoe_score=f.earnings_quality_score,
            )


async def run_screener(
    session: AsyncSession, req: ScreenerRequest
) -> tuple[list[StockResult], int, int]:
    """Returns (results_page, matched_count, universe_count).

    matched_count is the full number of stocks satisfying the filter (NOT the
    truncated page length), so the UI can show "X of Y matched" correctly even
    when results exceed ``req.limit``."""
    latest = _latest_metric_ids()
    universe = (
        await session.execute(
            select(func.count()).select_from(StockMetric).where(StockMetric.id.in_(latest))
        )
    ).scalar_one()

    avg_pe = _avg_hist_pe_sq()
    avg_pe_col = avg_pe.c.avg_pe
    # % of current P/E vs the stock's own historical average (neg = cheaper than history).
    pe_vs_hist_expr = (StockMetric.pe - avg_pe_col) / func.nullif(avg_pe_col, 0) * 100

    base = (
        select(Stock, StockMetric, avg_pe_col)
        .join(StockMetric, StockMetric.symbol == Stock.symbol)
        .outerjoin(avg_pe, avg_pe.c.symbol == Stock.symbol)
        .where(StockMetric.id.in_(latest))
    )
    conds = _filter_conditions(req)
    if req.pe_vs_hist_max is not None:
        conds += [StockMetric.pe > 0, avg_pe_col.isnot(None), pe_vs_hist_expr <= req.pe_vs_hist_max]
    if conds:
        base = base.where(*conds)

    matched = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    if req.safe_sort_by() == "pe_vs_hist":
        col = pe_vs_hist_expr
    else:
        col = _sort_column(req.safe_sort_by())
    query = base.order_by(
        col.desc() if req.sort_order == "desc" else col.asc()
    ).limit(req.limit)

    rows = (await session.execute(query)).all()
    results = [_row_to_result(stock, metric, ave) for stock, metric, ave in rows]
    await _attach_compass_long(session, results)
    await _attach_fraud_fields(session, results)
    return results, matched, universe
