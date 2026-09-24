"""APScheduler jobs: refresh metrics after market close, refresh listing nightly.

Disabled by default (SCHEDULER_ENABLED=false). Phase 1 verifies the data →
screener → UI path before relying on automated sync.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import Stock
from app.services import index_data
from app.services.data_fetcher import (
    sync_metrics,
    sync_prices_resilient,
    sync_stock_list,
)

logger = logging.getLogger("vnios.sync")


async def sync_all_metrics_job() -> None:
    """Job 1 — 15:30 Mon–Fri: refresh metrics for every tracked symbol."""
    async with SessionLocal() as session:
        symbols = list(
            (await session.execute(select(Stock.symbol))).scalars().all()
        )
        if not symbols:
            logger.warning("[SKIP] metrics sync — no symbols in DB")
            return
        result = await sync_metrics(session, symbols)
        logger.info("[JOB] metrics sync complete — %s", result)


async def sync_prices_job() -> None:
    """Job 1b — 15:35 Mon–Fri: refresh avg_volume_30d + day-change from OHLC.

    Uses the resilient (chunked/paced/circuit-breaker) sync so a silent WAF block
    can't stale the whole universe unnoticed — a break is logged at ERROR."""
    async with SessionLocal() as session:
        symbols = list((await session.execute(select(Stock.symbol))).scalars().all())
        if not symbols:
            logger.warning("[SKIP] price sync — no symbols in DB")
            return
        result = await sync_prices_resilient(session, symbols)
        if result.get("circuit_broken"):
            logger.error(
                "[JOB] price sync CIRCUIT-BROKEN at %s — only %s/%s refreshed, rest may be "
                "STALE. Investigate rate-limit / re-run scripts.price_backfill.",
                result.get("stopped_at"), result.get("updated"), result.get("total"),
            )
        else:
            logger.info("[JOB] price sync complete — %s", result)


async def sync_index_job() -> None:
    """Job 1c — 15:40 Mon–Fri: refresh market index bars (VN-Index & co) from KBS."""
    async with SessionLocal() as session:
        for symbol, _ in index_data.INDICES:
            try:
                n = await index_data.sync_index(session, symbol)
                logger.info("[JOB] index %s synced %d bars", symbol, n)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[JOB] index %s sync failed — %s", symbol, exc)


async def sync_stock_list_job() -> None:
    """Job 2 — 02:00 daily: refresh the master symbol list (catch IPOs)."""
    async with SessionLocal() as session:
        count = await sync_stock_list(session)
        logger.info("[JOB] listing sync complete — %d symbols", count)


async def fraud_scan_job() -> None:
    """Job 1d — 15:45 Mon–Fri: recompute fraud/strength scores from the stored
    financial_statements (pure math, no HTTP; runs after the metrics refresh)."""
    from app.services.fraud_scan import run_universe_scan

    async with SessionLocal() as session:
        report = await run_universe_scan(session)
        logger.info("[JOB] fraud scan complete — scanned %s", report.get("scanned"))


def start_scheduler() -> AsyncIOScheduler:
    settings = get_settings()
    scheduler = AsyncIOScheduler(timezone=settings.sync_timezone)
    scheduler.add_job(
        sync_all_metrics_job,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=30),
        id="sync_metrics",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_prices_job,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=35),
        id="sync_prices",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_index_job,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=40),
        id="sync_index",
        replace_existing=True,
    )
    scheduler.add_job(
        fraud_scan_job,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=45),
        id="fraud_scan",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_stock_list_job,
        CronTrigger(hour=2, minute=0),
        id="sync_listing",
        replace_existing=True,
    )
    scheduler.start()
    return scheduler
