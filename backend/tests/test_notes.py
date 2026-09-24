"""Notes CRUD via the router functions + the seeded session."""
from __future__ import annotations

import pytest

from app.models import User
from app.routers.notes import create_note, delete_note, list_notes, update_note
from app.schemas.note import NoteCreate, NoteUpdate


async def test_create_list_update_delete(session, user) -> None:
    created = await create_note(NoteCreate(symbol="fpt", content="  Nền tảng tốt  "), db=session, user=user)
    nid = created.data.id
    assert created.data.symbol == "FPT"
    assert created.data.content == "Nền tảng tốt"  # trimmed

    # A note for another symbol should not show in FPT's list.
    await create_note(NoteCreate(symbol="VCB", content="ngân hàng"), db=session, user=user)

    fpt = await list_notes(symbol="fpt", db=session, user=user)
    assert [n.symbol for n in fpt.data] == ["FPT"]

    updated = await update_note(nid, NoteUpdate(content="Cập nhật"), db=session, user=user)
    assert updated.data.content == "Cập nhật"

    deleted = await delete_note(nid, db=session, user=user)
    assert deleted.data == {"id": nid, "deleted": True}

    remaining = await list_notes(symbol="FPT", db=session, user=user)
    assert remaining.data == []


async def test_symbol_blank_becomes_none(session, user) -> None:
    created = await create_note(NoteCreate(symbol="   ", content="ghi chú chung"), db=session, user=user)
    assert created.data.symbol is None


async def test_update_missing_note_404(session, user) -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await update_note(99999, NoteUpdate(content="x"), db=session, user=user)


async def test_notes_are_isolated_per_user(session, user) -> None:
    """User B must not see, edit, or delete User A's note (no IDOR across tenants)."""
    from fastapi import HTTPException

    other = User(email="b@example.com", password_hash="x")
    session.add(other)
    await session.commit()
    await session.refresh(other)

    a_note = await create_note(NoteCreate(symbol="FPT", content="của A"), db=session, user=user)
    nid = a_note.data.id

    # B's list is empty; B can't update or delete A's note (404, not silently mutating it).
    assert (await list_notes(symbol=None, db=session, user=other)).data == []
    with pytest.raises(HTTPException):
        await update_note(nid, NoteUpdate(content="hack"), db=session, user=other)
    with pytest.raises(HTTPException):
        await delete_note(nid, db=session, user=other)

    # A's note is untouched.
    assert (await list_notes(symbol=None, db=session, user=user)).data[0].content == "của A"
