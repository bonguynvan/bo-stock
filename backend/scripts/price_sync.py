"""Backfill avg_volume_30d + day-change for the whole universe from live OHLC.

OHLC is not stored in the DB (it's fetched live from VCI), so this pulls ~35
daily bars per symbol, computes the 30-day average volume + day change, and
updates each symbol's latest metric row. Reports how many are actually liquid.

Run (live VCI, safe pacing):
    DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=5 python -m scripts.price_sync
"""
from __future__ import annotations

import asyncio


async def _run() -> int:
    from sqlalchemy import func, select

    from app.database import SessionLocal
    from app.models import Stock, StockMetric
    from app.services.data_fetcher import LIQUID_THRESHOLD, sync_prices

    async with SessionLocal() as session:
        symbols = list((await session.execute(select(Stock.symbol))).scalars().all())
        print(f"=== Price/volume backfill: {len(symbols)} symbols ===", flush=True)
        result = await sync_prices(session, symbols)

        # Universe liquidity snapshot from the DB after backfill.
        total = (await session.execute(select(func.count(Stock.symbol)))).scalar_one()
        with_vol = (
            await session.execute(
                select(func.count())
                .select_from(StockMetric)
                .where(StockMetric.avg_volume_30d.isnot(None))
            )
        ).scalar_one()
        liquid = (
            await session.execute(
                select(func.count())
                .select_from(StockMetric)
                .where(StockMetric.avg_volume_30d > LIQUID_THRESHOLD)
            )
        ).scalar_one()

    print("\n=== REPORT ===", flush=True)
    print(f"sync result      : {result}", flush=True)
    print(f"universe total   : {total}", flush=True)
    print(f"have avg_volume  : {with_vol}", flush=True)
    print(f"liquid (>500k)   : {liquid}  <-- tradeable universe", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
