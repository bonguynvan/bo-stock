"""GET /screener/compare — latest metrics for an ad-hoc symbol set."""
from __future__ import annotations

from app.routers.screener import compare_symbols


async def test_returns_rows_for_requested_symbols_in_order(session) -> None:
    env = await compare_symbols(symbols="BBB,AAA", db=session)
    syms = [r.symbol for r in env.data]
    assert set(syms) == {"AAA", "BBB"}
    assert env.meta["requested"] == 2
    assert env.meta["found"] == 2


async def test_ignores_blanks_and_uppercases(session) -> None:
    env = await compare_symbols(symbols=" aaa , , ", db=session)
    assert [r.symbol for r in env.data] == ["AAA"]
    assert env.meta["requested"] == 1


async def test_unknown_symbols_are_dropped(session) -> None:
    env = await compare_symbols(symbols="AAA,ZZZ", db=session)
    assert [r.symbol for r in env.data] == ["AAA"]
    assert env.meta["requested"] == 2
    assert env.meta["found"] == 1
