"""DB-backed tests for the investment journal CRUD + price snapshot."""
from __future__ import annotations

from app.models import JournalEntry
from app.schemas.journal import JournalCreate
from app.services.stock_service import latest_close_price


async def test_latest_close_price_from_seed(session) -> None:
    assert await latest_close_price(session, "AAA") == 25000.0
    assert await latest_close_price(session, "ZZZ") is None  # unknown symbol


async def test_create_entry_snapshots_price(session) -> None:
    # Mirrors the router's create logic: snapshot the latest close on write.
    req = JournalCreate(symbol="aaa", action="buy", thesis="Cheap vs growth",
                        target_price=32000, catalyst="Q2 earnings")
    sym = req.normalized_symbol()
    price = await latest_close_price(session, sym)
    row = JournalEntry(symbol=sym, action=req.action, thesis=req.thesis,
                       target_price=req.target_price, catalyst=req.catalyst,
                       price_at_entry=price, status="open")
    session.add(row)
    await session.commit()
    await session.refresh(row)
    assert row.symbol == "AAA"  # normalized
    assert row.price_at_entry == 25000.0
    assert row.status == "open"


async def test_create_note_without_symbol_has_no_price(session) -> None:
    req = JournalCreate(action="note", thesis="Market feels frothy")
    assert req.normalized_symbol() is None


async def test_list_filter_by_symbol(session) -> None:
    from sqlalchemy import select

    session.add_all([
        JournalEntry(symbol="AAA", action="buy", thesis="a", status="open"),
        JournalEntry(symbol="BBB", action="watch", thesis="b", status="open"),
    ])
    await session.commit()
    rows = (
        await session.execute(select(JournalEntry).where(JournalEntry.symbol == "AAA"))
    ).scalars().all()
    assert len(rows) == 1 and rows[0].thesis == "a"
