"""Full-universe metrics sync with progress, failure categorization, and a
data-quality report.

Run (live VCI, safe pacing, no day-change/OHLC in bulk):
    DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=4 python -m scripts.full_sync

Writes a JSON report to ``full_sync_report.json`` and prints a summary.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time

# Core fields for the data-quality (>50% NULL) check. market_cap lives on Stock;
# the rest on StockMetric.
METRIC_FIELDS = [
    "pe", "pb", "roe", "roa", "net_margin", "gross_margin", "current_ratio",
    "debt_equity", "dividend_yield", "close_price", "eps_trailing",
]
TOTAL_FIELDS = len(METRIC_FIELDS) + 1  # + market_cap (on Stock)
REPORT_PATH = "full_sync_report.json"


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Full-universe metrics sync + report")
    p.add_argument("--limit", type=int, default=0, help="cap symbols (0 = all)")
    p.add_argument("--concurrency", type=int, default=4)
    return p.parse_args()


def _classify(exc: Exception) -> str:
    s = str(exc).lower()
    if any(k in s for k in ("error page", "429", "too many", "403", "rate")):
        return "rate_limit"
    if any(k in s for k in ("404", "not found", "no data", "empty")):
        return "data_missing"
    return f"parse_error:{type(exc).__name__}"


async def _run(args: argparse.Namespace) -> int:
    from sqlalchemy import select

    from app.database import Base, SessionLocal, engine
    from app.models import Stock, StockMetric
    from app.services.data_fetcher import persist_one, sync_stock_list
    from app.services.providers import get_provider

    provider = get_provider("vci")  # direct VCI; bulk does not need fallback
    print(f"=== Full universe sync (provider: {provider.name}) ===", flush=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        await sync_stock_list(session)
        symbols = list(
            (await session.execute(select(Stock.symbol).order_by(Stock.symbol)))
            .scalars()
            .all()
        )
    if args.limit:
        symbols = symbols[: args.limit]
    total = len(symbols)
    print(f"Symbols to sync: {total}", flush=True)

    sem = asyncio.Semaphore(args.concurrency)
    lock = asyncio.Lock()
    start = time.monotonic()
    done = 0
    outcomes: dict[str, list[str]] = {"ok": [], "empty": [], "failed": []}
    failures: dict[str, str] = {}  # symbol -> reason

    async def work(sym: str) -> None:
        nonlocal done
        status = "failed"
        reason: str | None = None
        try:
            m = await provider.fetch_stock_metrics(sym, with_ohlc=False)
            if any(v is not None for v in (m.pe, m.pb, m.roe, m.roa)):
                await persist_one(m)
                status = "ok"
            else:
                status, reason = "empty", "data_missing"
        except Exception as exc:  # noqa: BLE001
            reason = _classify(exc)
        async with lock:
            done += 1
            outcomes[status].append(sym)
            if reason:
                failures[sym] = reason
            if done % 50 == 0 or done == total:
                el = time.monotonic() - start
                eta = el / done * (total - done) if done else 0
                ok = len(outcomes["ok"])
                print(
                    f"[PROGRESS] {done}/{total} ({done / total * 100:.1f}%) "
                    f"ok={ok} empty={len(outcomes['empty'])} failed={len(outcomes['failed'])} "
                    f"| elapsed={el:.0f}s eta={eta:.0f}s",
                    flush=True,
                )

    async def bounded(sym: str) -> None:
        async with sem:
            await work(sym)

    await asyncio.gather(*(bounded(s) for s in symbols))
    if hasattr(provider, "aclose"):
        await provider.aclose()

    # --- data quality: symbols with >50% of KEY_FIELDS NULL -----------------
    from app.services.screener import _latest_metric_ids

    low_quality: list[dict] = []
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(Stock, StockMetric)
                .join(StockMetric, StockMetric.symbol == Stock.symbol)
                .where(StockMetric.id.in_(_latest_metric_ids()))
            )
        ).all()
        for stock, r in rows:
            nulls = [f for f in METRIC_FIELDS if getattr(r, f) is None]
            if stock.market_cap is None:
                nulls.append("market_cap")
            if len(nulls) > TOTAL_FIELDS / 2:
                low_quality.append({"symbol": r.symbol, "null_fields": nulls})

    await engine.dispose()

    # --- failure breakdown by reason ----------------------------------------
    by_reason: dict[str, list[str]] = {}
    for sym, reason in failures.items():
        by_reason.setdefault(reason, []).append(sym)

    elapsed = time.monotonic() - start
    report = {
        "total_attempted": total,
        "success": len(outcomes["ok"]),
        "empty": len(outcomes["empty"]),
        "failed": len(outcomes["failed"]),
        "elapsed_seconds": round(elapsed, 1),
        "failures_by_reason": {k: sorted(v) for k, v in by_reason.items()},
        "empty_symbols": sorted(outcomes["empty"]),
        "low_quality": sorted(low_quality, key=lambda x: x["symbol"]),
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\n========== SYNC REPORT ==========", flush=True)
    print(f"Attempted : {total}")
    print(f"Success   : {report['success']}")
    print(f"Empty     : {report['empty']} (no valuation/profitability data)")
    print(f"Failed    : {report['failed']}")
    print(f"Elapsed   : {elapsed:.0f}s")
    print("Failures by reason:")
    for reason, syms in sorted(by_reason.items()):
        sample = ", ".join(syms[:10]) + (" …" if len(syms) > 10 else "")
        print(f"  {reason}: {len(syms)}  [{sample}]")
    print(f"Data-quality (>50% NULL): {len(low_quality)} symbols")
    for lq in low_quality[:15]:
        print(f"  {lq['symbol']}: {len(lq['null_fields'])} null — {', '.join(lq['null_fields'])}")
    if len(low_quality) > 15:
        print(f"  … and {len(low_quality) - 15} more (see {REPORT_PATH})")
    print(f"\nFull report: {REPORT_PATH}", flush=True)
    return 0


def main() -> None:
    import sys
    sys.exit(asyncio.run(_run(_parse_args())))


if __name__ == "__main__":
    main()
