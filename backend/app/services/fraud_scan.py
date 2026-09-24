"""Batch scan: compute Beneish/Altman/Piotroski for every symbol with ≥2 annual
periods in financial_statements, and persist to fraud_scores. Pure math, no AI.
Returns a calibration distribution so the caller can sanity-check flag rates.
"""
from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinancialStatement, FraudScore, Stock
from app.services.earnings_quality import calculate_earnings_quality
from app.services.fraud_detection import (
    calculate_altman,
    calculate_altman_emerging,
    calculate_beneish,
    calculate_piotroski,
)


def _period(fs: FinancialStatement, market_cap: int | None = None) -> dict:
    """Adapt a raw statement row to the formula input dict (derived fields computed,
    nothing fabricated — a missing raw field propagates to None)."""
    rev, gp, ta = fs.revenue, fs.gross_profit, fs.total_assets
    ca, cl, ni = fs.current_assets, fs.current_liabilities, fs.net_income
    return {
        "revenue": rev, "receivables": fs.receivables, "ppe": fs.ppe,
        "gross_margin": (gp / rev) if (gp is not None and rev) else None,
        "current_assets": ca, "securities": None, "total_assets": ta,
        "depreciation": fs.depreciation, "sga": fs.sga_expense,
        "current_liabilities": cl, "long_term_debt": fs.long_term_liabilities,
        "net_income": ni, "operating_cashflow": fs.operating_cashflow,
        "working_capital": (ca - cl) if (ca is not None and cl is not None) else None,
        "retained_earnings": fs.retained_earnings, "ebit": fs.operating_profit,
        "total_liabilities": fs.total_liabilities, "market_cap": market_cap,
        "roa": (ni / ta * 100) if (ni is not None and ta) else None,
        "current_ratio": (ca / cl) if (ca is not None and cl) else None,
        "shares": None,
    }


async def run_universe_scan(session: AsyncSession) -> dict:
    stocks = {s.symbol: s for s in (await session.execute(select(Stock))).scalars()}
    rows = (await session.execute(
        select(FinancialStatement)
        .where(FinancialStatement.period_type == "year")
        .order_by(FinancialStatement.symbol, FinancialStatement.period)
    )).scalars().all()

    by_sym: dict[str, list] = defaultdict(list)
    for r in rows:
        by_sym[r.symbol].append(r)

    scanned = skipped = 0
    beneish_flags: Counter = Counter()
    altman_zones: Counter = Counter()
    altman_em_zones: Counter = Counter()
    fscores: Counter = Counter()
    qoe_flags: Counter = Counter()

    for sym, periods in by_sym.items():
        if len(periods) < 2:
            skipped += 1
            continue
        periods.sort(key=lambda p: p.period)
        cur, prior = periods[-1], periods[-2]
        st = stocks.get(sym)
        mcap = st.market_cap if st else None
        sector = st.industry if st else None

        curd, priord = _period(cur, mcap), _period(prior)
        b = calculate_beneish(curd, priord)
        a = calculate_altman(curd, sector)
        aem = calculate_altman_emerging(curd, sector)
        p = calculate_piotroski(curd, priord)
        q = calculate_earnings_quality(curd, priord)

        beneish_flags[b.flag] += 1
        altman_zones[a.zone] += 1
        altman_em_zones[aem.zone] += 1
        fscores[p.score] += 1
        qoe_flags[q.flag] += 1

        detail = {"criteria": p.criteria, "max_score": p.max_score}
        qoe_detail = {"components": q.components, "components_used": q.components_used}
        values = dict(
            beneish_mscore=b.score, beneish_variables_used=b.variables_used, beneish_flag=b.flag,
            altman_zscore=a.score, altman_zone=a.zone,
            altman_em_zscore=aem.score, altman_em_zone=aem.zone,
            piotroski_fscore=p.score, piotroski_detail=detail,
            earnings_quality_score=q.score, earnings_quality_flag=q.flag,
            earnings_quality_detail=qoe_detail,
        )
        stmt = pg_insert(FraudScore).values(symbol=sym, period=cur.period, **values)
        stmt = stmt.on_conflict_do_update(constraint="uq_fraud_score_period", set_=values)
        await session.execute(stmt)
        scanned += 1

    await session.commit()
    return {
        "scanned": scanned,
        "skipped_lt2_periods": skipped,
        "beneish_flags": dict(beneish_flags),
        "altman_zones": dict(altman_zones),
        "altman_em_zones": dict(altman_em_zones),
        "piotroski_fscore_hist": {k: fscores[k] for k in sorted(fscores)},
        "earnings_quality_flags": dict(qoe_flags),
    }
