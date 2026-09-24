"""Orchestrates the configured provider: fetch → normalize → upsert into DB.

Public entrypoints: ``fetch_stock_list`` and
``fetch_stock_metrics``. Sync helpers persist results with explicit per-symbol
logging and bounded concurrency.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, fields

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import SessionLocal
from app.models import MetricHistory, Stock, StockMetric
from app.services.providers import FetchedMetrics, FetchedStock, get_provider
from app.services.scoring import MetricInputs, compute_quant_score

logger = logging.getLogger("vnios.fetcher")

# Columns that StockMetric actually has (filters out detail-only extras).
_METRIC_COLUMNS = {c.name for c in StockMetric.__table__.columns}


async def fetch_stock_list() -> list[FetchedStock]:
    return await get_provider().fetch_stock_list()


async def fetch_stock_metrics(symbol: str) -> FetchedMetrics:
    return await get_provider().fetch_stock_metrics(symbol)


def _quant_score(m: FetchedMetrics) -> float:
    return compute_quant_score(
        MetricInputs(
            roe=m.roe, roa=m.roa, net_margin=m.net_margin,
            revenue_growth=m.revenue_growth, eps_growth=m.eps_growth,
            pe=m.pe, pb=m.pb, debt_equity=m.debt_equity,
        )
    )


async def sync_stock_list(session: AsyncSession) -> int:
    """Upsert the master list of symbols. Returns count processed."""
    stocks = await fetch_stock_list()
    # scalars() over a single column yields the symbol strings directly.
    existing = set((await session.execute(select(Stock.symbol))).scalars().all())
    count = 0
    for fs in stocks:
        if fs.symbol in existing:
            row = await session.get(Stock, fs.symbol)
            row.company_name = fs.company_name or row.company_name
            row.exchange = fs.exchange or row.exchange
            row.industry = fs.industry or row.industry
            if fs.market_cap is not None:
                row.market_cap = fs.market_cap
        else:
            session.add(
                Stock(
                    symbol=fs.symbol, company_name=fs.company_name,
                    exchange=fs.exchange, industry=fs.industry, market_cap=fs.market_cap,
                )
            )
        count += 1
    await session.commit()
    logger.info("[SUCCESS] stock list synced — %d symbols", count)
    return count


def _metrics_to_columns(m: FetchedMetrics) -> dict:
    data = {k: v for k, v in asdict(m).items() if k in _METRIC_COLUMNS}
    data["quant_score"] = _quant_score(m)
    return data


async def _upsert_metric(session: AsyncSession, m: FetchedMetrics) -> None:
    cols = _metrics_to_columns(m)
    stmt = select(StockMetric).where(
        StockMetric.symbol == m.symbol,
        StockMetric.report_date == m.report_date,
        StockMetric.period == m.period,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing:
        for k, v in cols.items():
            setattr(existing, k, v)
    else:
        session.add(StockMetric(**cols))


_HISTORY_FIELDS = (
    "roe", "roa", "net_margin", "gross_margin", "pe", "pb", "eps", "bvps", "dividend_yield"
)


async def _upsert_history(session: AsyncSession, symbol: str, history: list[dict]) -> None:
    """Upsert the per-year ratio series into metric_history (one row per year)."""
    if not history:
        return
    existing = {
        row.year: row
        for row in (
            await session.execute(
                select(MetricHistory).where(MetricHistory.symbol == symbol)
            )
        ).scalars()
    }
    for rec in history:
        year = rec.get("year")
        if year is None:
            continue
        vals = {f: rec.get(f) for f in _HISTORY_FIELDS}
        row = existing.get(year)
        if row is not None:
            for f, v in vals.items():
                setattr(row, f, v)
        else:
            session.add(MetricHistory(symbol=symbol, year=year, **vals))


async def _persist_metric_row(session: AsyncSession, m: FetchedMetrics) -> None:
    """Upsert a metric row + enrich its Stock (market cap / industry / name)."""
    await _upsert_metric(session, m)
    await _upsert_history(session, m.symbol, m.ratio_history)
    if any(v is not None for v in (m.market_cap, m.industry, m.company_name)):
        stock = await session.get(Stock, m.symbol)
        if stock is not None:
            if m.market_cap is not None:
                stock.market_cap = m.market_cap
            if m.industry:
                stock.industry = m.industry
            if m.company_name:
                stock.company_name = m.company_name


async def persist_one(m: FetchedMetrics) -> None:
    """Persist a single symbol's metrics in its own session (concurrency-safe)."""
    async with SessionLocal() as session:
        await _persist_metric_row(session, m)
        await session.commit()


async def sync_metrics(session: AsyncSession, symbols: list[str]) -> dict[str, int]:
    """Fetch + persist metrics for ``symbols`` with bounded concurrency.

    Concurrency is capped by the configured rate limit; the provider also
    enforces a global requests/sec limiter. Returns {ok, failed} counts.
    """
    settings = get_settings()
    sem = asyncio.Semaphore(max(1, settings.http_rate_limit_per_sec))
    provider = get_provider()

    async def _fetch(sym: str) -> tuple[str, FetchedMetrics | None]:
        async with sem:
            try:
                return sym, await provider.fetch_stock_metrics(sym)
            except Exception as exc:  # noqa: BLE001
                logger.error("[FAILED] %s - %s", sym, exc)
                return sym, None

    results = await asyncio.gather(*(_fetch(s) for s in symbols))

    ok = 0
    for sym, metrics in results:
        if metrics is None:
            continue
        await _persist_metric_row(session, metrics)
        ok += 1
        logger.debug("[SUCCESS] %s - metrics updated", sym)
        if ok % 100 == 0:
            logger.info("[PROGRESS] %d/%d symbols synced", ok, len(symbols))
            await session.commit()  # checkpoint long runs
    await session.commit()
    if hasattr(provider, "aclose"):
        await provider.aclose()
    failed = len(symbols) - ok
    logger.info("[DONE] metrics sync — ok=%d failed=%d", ok, failed)
    return {"ok": ok, "failed": failed}


# --- Daily price / volume sync ---------------------------------------------

LIQUID_THRESHOLD = 500_000  # avg 30d volume considered "tradeable"


def compute_price_metrics(bars: list[dict]) -> dict:
    """From daily OHLC bars (ascending) → {avg_volume_30d, change_pct, close_price}.

    avg_volume_30d = mean of the last 30 bars' volume; change_pct = last close vs
    the previous close. Pure (no I/O) for unit testing.
    """
    closes = [b["close"] for b in bars if b.get("close") is not None]
    vols = [b["volume"] for b in bars if b.get("volume") is not None]
    out: dict = {}
    if closes:
        out["close_price"] = closes[-1]
        if len(closes) >= 2 and closes[-2]:
            out["change_pct"] = round((closes[-1] - closes[-2]) / closes[-2] * 100, 2)
    if vols:
        last30 = vols[-30:]
        out["avg_volume_30d"] = round(sum(last30) / len(last30))
    return out


async def _latest_metric_row(session: AsyncSession, symbol: str) -> StockMetric | None:
    return (
        await session.execute(
            select(StockMetric)
            .where(StockMetric.symbol == symbol)
            .order_by(StockMetric.report_date.desc().nullslast(), StockMetric.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def sync_prices(session: AsyncSession, symbols: list[str]) -> dict[str, int]:
    """Refresh avg_volume_30d + change_pct + close_price on each symbol's latest
    metric row from live OHLC. Returns counts incl. how many are liquid (>500k)."""
    settings = get_settings()
    sem = asyncio.Semaphore(max(1, settings.http_rate_limit_per_sec))
    provider = get_provider()

    async def _fetch(sym: str) -> tuple[str, list[dict] | None]:
        async with sem:
            try:
                return sym, await provider.fetch_ohlc(sym, 35)  # type: ignore[attr-defined]
            except Exception as exc:  # noqa: BLE001
                logger.error("[FAILED] price %s - %s", sym, exc)
                return sym, None

    results = await asyncio.gather(*(_fetch(s) for s in symbols))

    updated = no_data = liquid = 0
    for sym, bars in results:
        if not bars:
            no_data += 1
            continue
        row = await _latest_metric_row(session, sym)
        if row is None:
            no_data += 1
            continue
        pm = compute_price_metrics(bars)
        if "avg_volume_30d" in pm:
            row.avg_volume_30d = pm["avg_volume_30d"]
        if "change_pct" in pm:
            row.change_pct = pm["change_pct"]
        if "close_price" in pm:
            row.close_price = pm["close_price"]
        updated += 1
        if (pm.get("avg_volume_30d") or 0) > LIQUID_THRESHOLD:
            liquid += 1
        if updated % 100 == 0:
            logger.info("[PROGRESS] prices %d/%d", updated, len(symbols))
            await session.commit()

    await session.commit()
    if hasattr(provider, "aclose"):
        await provider.aclose()
    result = {
        "updated": updated,
        "no_data": no_data,
        "liquid_gt_500k": liquid,
        "total": len(symbols),
    }
    logger.info("[DONE] price sync — %s", result)
    return result


_RATE_MARKERS = ("429", "403", "too many requests", "forbidden")
_PRICE_CHUNK = 30       # symbols per chunk (stays under the WAF's burst window)
_PRICE_PAUSE = 20.0     # seconds between chunks (lets the WAF window reset)
_PRICE_CIRCUIT = 5      # consecutive rate-limit errors → stop, don't hammer


def _is_rate_limited(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(m in msg for m in _RATE_MARKERS)


async def sync_prices_resilient(
    session: AsyncSession, symbols: list[str]
) -> dict[str, int | bool | str | None]:
    """WAF-safe daily price/volume refresh: chunked + paced, COMMIT per symbol
    (partial progress survives), and a circuit breaker that STOPS after
    ``_PRICE_CIRCUIT`` consecutive rate-limit errors and logs at ERROR so a WAF
    block is visible in the logs — instead of silently staling every symbol.
    Returns counts + circuit_broken/stopped_at so the caller can alert."""
    provider = get_provider()
    updated = no_data = liquid = consecutive = 0
    stopped_at: str | None = None
    total = len(symbols)
    try:
        for start in range(0, total, _PRICE_CHUNK):
            if stopped_at:
                break
            chunk = symbols[start:start + _PRICE_CHUNK]
            for sym in chunk:
                try:
                    bars = await provider.fetch_ohlc(sym, 35)  # type: ignore[attr-defined]
                except Exception as exc:  # noqa: BLE001
                    if _is_rate_limited(exc):
                        consecutive += 1
                        logger.warning(
                            "[price][RATE-LIMIT %d/%d] %s", consecutive, _PRICE_CIRCUIT, sym
                        )
                        if consecutive >= _PRICE_CIRCUIT:
                            stopped_at = sym
                            logger.error(
                                "[price][CIRCUIT-BREAK] stopped at %s (%d/%d updated) — likely "
                                "WAF rate-limit. Volume/price data left as-is (may be STALE); "
                                "re-run scripts.price_backfill later.",
                                sym, updated, total,
                            )
                            break
                        continue
                    logger.warning("[price][FAILED] %s — %s", sym, str(exc)[:80])
                    consecutive = 0
                    no_data += 1
                    continue
                consecutive = 0
                if not bars:
                    no_data += 1
                    continue
                row = await _latest_metric_row(session, sym)
                if row is None:
                    no_data += 1
                    continue
                pm = compute_price_metrics(bars)
                if "avg_volume_30d" in pm:
                    row.avg_volume_30d = pm["avg_volume_30d"]
                if "change_pct" in pm:
                    row.change_pct = pm["change_pct"]
                if "close_price" in pm:
                    row.close_price = pm["close_price"]
                if (pm.get("avg_volume_30d") or 0) > LIQUID_THRESHOLD:
                    liquid += 1
                updated += 1
                await session.commit()  # checkpoint per symbol
            if not stopped_at and start + _PRICE_CHUNK < total:
                await asyncio.sleep(_PRICE_PAUSE)
    finally:
        if hasattr(provider, "aclose"):
            await provider.aclose()

    result = {
        "updated": updated, "no_data": no_data, "liquid_gt_500k": liquid,
        "total": total, "circuit_broken": stopped_at is not None, "stopped_at": stopped_at,
    }
    logger.info("[DONE] resilient price sync — %s", result)
    return result
