"""Notes CRUD via the router functions + the seeded session."""
from __future__ import annotations

import pytest

from app.routers.notes import create_note, delete_note, list_notes, update_note
from app.schemas.note import NoteCreate, NoteUpdate


async def test_create_list_update_delete(session) -> None:
    created = await create_note(NoteCreate(symbol="fpt", content="  Nền tảng tốt  "), db=session)
    nid = created.data.id
    assert created.data.symbol == "FPT"
    assert created.data.content == "Nền tảng tốt"  # trimmed

    # A note for another symbol should not show in FPT's list.
    await create_note(NoteCreate(symbol="VCB", content="ngân hàng"), db=session)

    fpt = await list_notes(symbol="fpt", db=session)
    assert [n.symbol for n in fpt.data] == ["FPT"]

    updated = await update_note(nid, NoteUpdate(content="Cập nhật"), db=session)
    assert updated.data.content == "Cập nhật"

    deleted = await delete_note(nid, db=session)
    assert deleted.data == {"id": nid, "deleted": True}

    remaining = await list_notes(symbol="FPT", db=session)
    assert remaining.data == []


async def test_symbol_blank_becomes_none(session) -> None:
    created = await create_note(NoteCreate(symbol="   ", content="ghi chú chung"), db=session)
    assert created.data.symbol is None


async def test_update_missing_note_404(session) -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await update_note(99999, NoteUpdate(content="x"), db=session)
