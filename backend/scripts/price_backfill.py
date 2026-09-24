"""Resumable, WAF-friendly price/volume backfill.

The VCI gap-chart endpoint WAF-blocks after ~38 rapid requests, and sync_prices
commits only after fetching the whole universe (a kill loses everything). This
wraps sync_prices in a chunked loop that:
  - only fetches symbols still MISSING avg_volume_30d (resumable — safe to re-run),
  - processes CHUNK symbols at a time and commits after each (survives kills),
  - PAUSEs between chunks so the WAF request-window resets.

Run (gentle; tune from a VN residential IP if needed):
    DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=1 \
      BACKFILL_CHUNK=30 BACKFILL_PAUSE=30 python -m scripts.price_backfill
"""
from __future__ import annotations

import asyncio
import os


async def _run() -> int:
    from sqlalchemy import func, select, text

    from app.database import SessionLocal
    from app.models import Stock, StockMetric
    from app.services.data_fetcher import LIQUID_THRESHOLD, sync_prices

    chunk_size = int(os.getenv("BACKFILL_CHUNK", "30"))
    pause = float(os.getenv("BACKFILL_PAUSE", "30"))

    async with SessionLocal() as session:
        # Resumable: only symbols whose latest metric row still lacks volume.
        missing = list((await session.execute(text("""
            WITH latest AS (
              SELECT DISTINCT ON (symbol) symbol, avg_volume_30d
              FROM stock_metrics ORDER BY symbol, report_date DESC NULLS LAST
            )
            SELECT symbol FROM latest WHERE avg_volume_30d IS NULL ORDER BY symbol
        """))).scalars().all())

        total = len(missing)
        print(f"=== Resumable backfill: {total} symbols missing volume | "
              f"chunk={chunk_size} pause={pause}s ===", flush=True)

        done = updated = 0
        for i in range(0, total, chunk_size):
            chunk = missing[i:i + chunk_size]
            res = await sync_prices(session, chunk)  # commits internally
            done += len(chunk)
            updated += res.get("updated", 0)
            print(f"[{done}/{total}] chunk updated={res.get('updated')} "
                  f"no_data={res.get('no_data')} liquid={res.get('liquid_gt_500k')}", flush=True)
            if i + chunk_size < total:
                await asyncio.sleep(pause)

        # Final universe liquidity snapshot.
        with_vol = (await session.execute(
            select(func.count()).select_from(StockMetric)
            .where(StockMetric.avg_volume_30d.isnot(None)))).scalar_one()
        liquid = (await session.execute(
            select(func.count()).select_from(StockMetric)
            .where(StockMetric.avg_volume_30d > LIQUID_THRESHOLD))).scalar_one()
        universe = (await session.execute(select(func.count(Stock.symbol)))).scalar_one()
        print("\n=== REPORT ===", flush=True)
        print(f"universe        : {universe}", flush=True)
        print(f"have avg_volume : {with_vol}", flush=True)
        print(f"liquid (>500k)  : {liquid}", flush=True)
        print(f"this run updated: {updated}", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
