"""Resumable financial-statement sync → financial_statements table.

WAF lessons from price_backfill, hardened:
  - default 1 req/s (statement endpoint is heavier than OHLC),
  - COMMIT after EVERY symbol (resume from the exact spot, never lose progress),
  - resumable: skips symbols already synced (re-run to continue; --resync to force),
  - circuit breaker: 5 consecutive rate-limit errors → stop, print the resume command,
    do NOT keep hammering the WAF ("further attempts are futile" — session lesson).

Run (from a VN IP; gentle):
    DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=1 python -m scripts.statement_sync
    DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=1 python -m scripts.statement_sync --resync
    DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=1 python -m scripts.statement_sync --limit 5
"""
from __future__ import annotations

import asyncio
import sys

_SECTIONS = ("INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW")
_CIRCUIT_LIMIT = 5
_RATE_MARKERS = ("429", "403", "too many requests", "forbidden")
_FIELDS = (
    "current_assets", "receivables", "ppe", "total_assets", "total_liabilities",
    "current_liabilities", "long_term_liabilities", "retained_earnings",
    "revenue", "gross_profit", "net_income", "operating_profit", "sga_expense",
    "operating_cashflow", "depreciation",
)


def _is_rate_limited(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(m in msg for m in _RATE_MARKERS)


async def _run() -> int:
    from sqlalchemy import select, text
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from app.database import SessionLocal
    from app.models import FinancialStatement, Stock
    from app.services.providers.vci import VCIProvider
    from app.services.statements import parse_vci_financial_statement

    resync = "--resync" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    only: list[str] | None = None
    if "--symbols" in sys.argv:
        only = [s.strip().upper() for s in sys.argv[sys.argv.index("--symbols") + 1].split(",") if s.strip()]

    async with SessionLocal() as session:
        all_syms = list((await session.execute(select(Stock.symbol).order_by(Stock.symbol))).scalars())
        done = set() if (resync or only) else set(
            (await session.execute(text("SELECT DISTINCT symbol FROM financial_statements"))).scalars()
        )
        todo = only if only else [s for s in all_syms if s not in done]
        if limit:
            todo = todo[:limit]
        print(f"=== Statement sync: {len(todo)} to sync "
              f"({len(done)} already done) | rate=1/s, circuit={_CIRCUIT_LIMIT} ===", flush=True)

        provider = VCIProvider()
        synced = periods = consecutive = 0
        stopped_at = None
        try:
            for i, sym in enumerate(todo, 1):
                try:
                    sections = {}
                    for s in _SECTIONS:
                        dic = await provider._get_json(
                            f"{provider._iq}/v1/company/{sym}/financial-statement/metrics?section={s}")
                        data = await provider._get_json(
                            f"{provider._iq}/v1/company/{sym}/financial-statement?section={s}")
                        sections[s] = (dic, data)
                    rows = parse_vci_financial_statement(sections, "year")
                    for r in rows:
                        vals = {k: r.get(k) for k in _FIELDS}
                        stmt = pg_insert(FinancialStatement).values(
                            symbol=sym, period=r["period"], period_type=r["period_type"],
                            source="vci", fields_available=r["fields_available"], **vals,
                        ).on_conflict_do_update(
                            constraint="uq_fin_stmt_period",
                            set_={**vals, "fields_available": r["fields_available"], "source": "vci"},
                        )
                        await session.execute(stmt)
                    await session.commit()  # checkpoint after EVERY symbol
                    synced += 1
                    periods += len(rows)
                    consecutive = 0
                    if i % 25 == 0:
                        print(f"[{i}/{len(todo)}] synced={synced} periods={periods} (last {sym})", flush=True)
                except Exception as exc:  # noqa: BLE001
                    if _is_rate_limited(exc):
                        consecutive += 1
                        print(f"[RATE-LIMIT {consecutive}/{_CIRCUIT_LIMIT}] {sym} — {str(exc)[:80]}", flush=True)
                        if consecutive >= _CIRCUIT_LIMIT:
                            stopped_at = sym
                            break
                    else:
                        print(f"[FAILED] {sym} — {type(exc).__name__}: {str(exc)[:80]}", flush=True)
                        consecutive = 0
        finally:
            if hasattr(provider, "aclose"):
                await provider.aclose()

        print("\n=== REPORT ===", flush=True)
        print(f"symbols synced this run : {synced}", flush=True)
        print(f"annual periods written  : {periods}", flush=True)
        total = (await session.execute(text(
            "SELECT COUNT(DISTINCT symbol) FROM financial_statements"))).scalar()
        print(f"symbols with statements : {total} / {len(all_syms)}", flush=True)
        if stopped_at:
            print(f"\n[CIRCUIT BREAKER] Stopped at '{stopped_at}' after {_CIRCUIT_LIMIT} "
                  f"consecutive rate-limit errors. Progress saved.", flush=True)
            print("Resume later (ideally from a VN IP): "
                  "DATA_PROVIDER=vci HTTP_RATE_LIMIT_PER_SEC=1 python -m scripts.statement_sync", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
