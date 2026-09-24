"""DB-backed tests for watchlist metrics + symbol normalization."""
from __future__ import annotations

from app.models import Watchlist
from app.schemas.watchlist import WatchlistCreate
from app.services.stock_service import metrics_for_symbols


def test_watchlist_create_normalizes_symbols() -> None:
    req = WatchlistCreate(name="Tech", symbols=["fpt", " VCB ", "fpt", ""])
    assert req.symbols == ["FPT", "VCB"]  # upper, trimmed, de-duped, blanks dropped


async def test_metrics_for_symbols_preserves_order_and_skips_missing(session) -> None:
    # seed has AAA..FFF; ZZZ is unknown and should be skipped
    results = await metrics_for_symbols(session, ["EEE", "AAA", "ZZZ"])
    assert [r.symbol for r in results] == ["EEE", "AAA"]
    assert all(r.roe is not None for r in results)


async def test_metrics_for_symbols_empty(session) -> None:
    assert await metrics_for_symbols(session, []) == []


async def test_watchlist_round_trip(session) -> None:
    row = Watchlist(name="Mine", symbols=["AAA", "BBB"])
    session.add(row)
    await session.commit()
    fetched = await session.get(Watchlist, row.id)
    assert fetched is not None
    assert fetched.symbols == ["AAA", "BBB"]
    results = await metrics_for_symbols(session, fetched.symbols)
    assert {r.symbol for r in results} == {"AAA", "BBB"}
