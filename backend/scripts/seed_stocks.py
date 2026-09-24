"""End-to-end pipeline verifier (run: ``python -m scripts.seed_stocks``).

Steps:
  1. Fetch the stock list from the provider → print count
  2. Fetch metrics for VCB, FPT, MWG, VNM, HPG → print a table
  3. Seed stocks + metrics into PostgreSQL
  4. Run the screener (ROE > 15, P/E < 20) → print the top 10

Use ``--fixtures`` to force the sample-data provider (works anywhere). Without
it the configured provider (TCBS) is used — run that from a Vietnamese IP.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

TEST_SYMBOLS = ["VCB", "FPT", "MWG", "VNM", "HPG"]


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed + verify the screener pipeline")
    p.add_argument("--fixtures", action="store_true", help="use sample-data provider")
    p.add_argument("--all", action="store_true", help="sync the entire universe (~1745)")
    p.add_argument("--list-limit", type=int, default=0, help="cap symbols synced (0=test set)")
    return p.parse_args()


async def _run(args: argparse.Namespace) -> int:
    # Import after possibly overriding the provider env var.
    from sqlalchemy import select

    from app.database import Base, SessionLocal, engine
    from app.models import Stock
    from app.schemas.screener import ScreenerRequest
    from app.services.data_fetcher import fetch_stock_metrics, sync_metrics, sync_stock_list
    from app.services.providers import get_provider
    from app.services.screener import run_screener

    provider = get_provider()
    print(f"\n=== V-Investment OS — pipeline verify (provider: {provider.name}) ===\n")

    # Ensure schema exists (idempotent; complements alembic).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Step 1 — stock list
    stocks = await provider.fetch_stock_list()
    print(f"[1] Fetched stock list: {len(stocks)} symbols")
    if not stocks:
        print("    ! empty list — provider unreachable?")
        return 1

    # Step 2 — metrics for the 5 test tickers
    print(f"\n[2] Metrics for test set: {', '.join(TEST_SYMBOLS)}")
    header = f"    {'SYM':<5} {'PE':>6} {'PB':>6} {'ROE%':>7} {'NPM%':>7} {'RevG%':>7} {'Price':>9}"
    print(header)
    print("    " + "-" * (len(header) - 4))
    for sym in TEST_SYMBOLS:
        m = await fetch_stock_metrics(sym)
        print(
            f"    {sym:<5} {_f(m.pe):>6} {_f(m.pb):>6} {_f(m.roe):>7} "
            f"{_f(m.net_margin):>7} {_f(m.revenue_growth):>7} {_f(m.close_price):>9}"
        )

    # Step 3 — seed DB
    async with SessionLocal() as session:
        await sync_stock_list(session)
        all_syms = list((await session.execute(select(Stock.symbol))).scalars().all())
        if args.all:
            target = all_syms
        elif args.list_limit:
            target = all_syms[: args.list_limit]
        elif provider.name == "fixtures":
            target = all_syms
        else:
            target = TEST_SYMBOLS
        result = await sync_metrics(session, target)
        print(f"\n[3] Seeded DB — metrics ok={result['ok']} failed={result['failed']}")

        # Step 4 — screener: ROE > 15, P/E < 20
        req = ScreenerRequest(roe_min=15, pe_max=20, limit=10, sort_by="quant_score")
        results, total = await run_screener(session, req)
        print(f"\n[4] Screener (ROE>15, P/E<20) — {len(results)}/{total} matched, top 10:")
        print(f"    {'#':>2} {'SYM':<5} {'GRADE':>6} {'SCORE':>6} {'PE':>6} {'ROE%':>7} {'NAME'}")
        for i, r in enumerate(results, 1):
            print(
                f"    {i:>2} {r.symbol:<5} {str(r.quant_grade):>6} {_f(r.quant_score):>6} "
                f"{_f(r.pe):>6} {_f(r.roe):>7} {r.company_name or ''}"
            )

    await engine.dispose()
    print("\n=== pipeline OK: data → DB → screener verified ===\n")
    return 0


def _f(v: float | None) -> str:
    return "—" if v is None else f"{v:g}"


def main() -> None:
    args = _parse_args()
    if args.fixtures:
        os.environ["DATA_PROVIDER"] = "fixtures"
    sys.exit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
