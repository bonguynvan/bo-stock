"""Read services for stock listing and the detail panel."""
from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Stock, StockMetric
from app.schemas.stock import (
    OwnershipEntry,
    QuarterlyPoint,
    StockDetail,
    StockResult,
)
from app.services.providers import get_provider
from app.services.screener import _latest_metric_ids, _row_to_result

logger = logging.getLogger("vnios.stock")


async def list_stocks(
    session: AsyncSession,
    *,
    exchange: str | None = None,
    industry: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[StockResult], int]:
    base = (
        select(Stock, StockMetric)
        .join(StockMetric, StockMetric.symbol == Stock.symbol)
        .where(StockMetric.id.in_(_latest_metric_ids()))
    )
    if exchange:
        base = base.where(Stock.exchange == exchange.upper())
    if industry:
        base = base.where(Stock.industry == industry)

    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    rows = (
        await session.execute(
            base.order_by(StockMetric.quant_score.desc().nullslast())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [_row_to_result(s, m) for s, m in rows], total


async def get_ohlc(symbol: str, count: int = 120) -> list[dict]:
    """Daily OHLC bars for the price chart (provider-backed; best-effort)."""
    provider = get_provider()
    if not hasattr(provider, "fetch_ohlc"):
        return []
    try:
        return await provider.fetch_ohlc(symbol, count)  # type: ignore[attr-defined]
    except Exception as exc:  # noqa: BLE001
        logger.warning("[WARN] OHLC unavailable for %s — %s", symbol, exc)
        return []
    finally:
        if hasattr(provider, "aclose"):
            await provider.aclose()


async def latest_close_price(session: AsyncSession, symbol: str) -> float | None:
    """Latest close price for a symbol (for journal price-at-entry snapshots)."""
    return (
        await session.execute(
            select(StockMetric.close_price).where(
                StockMetric.symbol == symbol.upper(),
                StockMetric.id.in_(_latest_metric_ids()),
            )
        )
    ).scalar_one_or_none()


async def metrics_for_symbols(
    session: AsyncSession, symbols: list[str]
) -> list[StockResult]:
    """Latest metrics for an explicit symbol list, preserving the given order."""
    if not symbols:
        return []
    syms = [s.upper() for s in symbols]
    rows = (
        await session.execute(
            select(Stock, StockMetric)
            .join(StockMetric, StockMetric.symbol == Stock.symbol)
            .where(Stock.symbol.in_(syms), StockMetric.id.in_(_latest_metric_ids()))
        )
    ).all()
    by_symbol = {s.symbol: _row_to_result(s, m) for s, m in rows}
    return [by_symbol[s] for s in syms if s in by_symbol]


async def get_stock_detail(session: AsyncSession, symbol: str) -> StockDetail | None:
    symbol = symbol.upper()
    row = (
        await session.execute(
            select(Stock, StockMetric)
            .join(StockMetric, StockMetric.symbol == Stock.symbol)
            .where(Stock.symbol == symbol, StockMetric.id.in_(_latest_metric_ids()))
        )
    ).first()
    if not row:
        return None

    stock, metric = row
    base = _row_to_result(stock, metric)
    detail = StockDetail(
        **base.model_dump(),
        charter_capital=metric.charter_capital,
        eps_trailing=metric.eps_trailing,
        profit_growth=metric.profit_growth,
        cash=metric.cash,
    )

    # Real ownership breakdown + quarterly profit chart (best-effort; the UI
    # degrades gracefully when a provider can't supply them).
    provider = get_provider()
    try:
        if hasattr(provider, "fetch_ownership"):
            try:
                owners = await provider.fetch_ownership(symbol)
                detail.ownership = [OwnershipEntry(**o) for o in owners]
            except Exception as exc:  # noqa: BLE001
                logger.warning("[WARN] ownership unavailable for %s — %s", symbol, exc)
        if hasattr(provider, "fetch_fundamentals"):
            try:
                f = await provider.fetch_fundamentals(symbol)
                detail.quarterly_profit = [
                    QuarterlyPoint(**q) for q in f.get("quarterly_profit", [])
                ]
                if f.get("profit_growth") is not None:
                    detail.profit_growth = f["profit_growth"]
                if f.get("charter_capital") is not None:
                    detail.charter_capital = f["charter_capital"]
                if f.get("cash") is not None:
                    detail.cash = f["cash"]
            except Exception as exc:  # noqa: BLE001
                logger.warning("[WARN] fundamentals unavailable for %s — %s", symbol, exc)
    finally:
        if hasattr(provider, "aclose"):
            await provider.aclose()

    return detail
