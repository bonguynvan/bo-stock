"""Free-form research notes (single-user, no auth). Research-only."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, User
from app.routers.auth import get_current_user
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate
from app.schemas.stock import Envelope

router = APIRouter(prefix="/notes", tags=["notes"])


def _to_out(n: Note) -> NoteOut:
    return NoteOut(
        id=n.id,
        symbol=n.symbol,
        content=n.content,
        created_at=n.created_at.isoformat() if n.created_at else None,
        updated_at=n.updated_at.isoformat() if n.updated_at else None,
    )


@router.post("", response_model=Envelope[NoteOut])
async def create_note(
    req: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[NoteOut]:
    symbol = req.symbol.strip().upper() if req.symbol and req.symbol.strip() else None
    row = Note(symbol=symbol, content=req.content.strip(), user_id=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.get("", response_model=Envelope[list[NoteOut]])
async def list_notes(
    symbol: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list[NoteOut]]:
    stmt = select(Note).where(Note.user_id == user.id).order_by(Note.created_at.desc())
    if symbol:
        stmt = stmt.where(Note.symbol == symbol.strip().upper())
    rows = (await db.execute(stmt)).scalars().all()
    return Envelope(data=[_to_out(n) for n in rows])


@router.put("/{note_id}", response_model=Envelope[NoteOut])
async def update_note(
    note_id: int,
    req: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[NoteOut]:
    row = (
        await db.execute(
            select(Note).where(Note.id == note_id, Note.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Note not found")
    row.content = req.content.strip()
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.delete("/{note_id}", response_model=Envelope[dict])
async def delete_note(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    result = await db.execute(
        delete(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return Envelope(data={"id": note_id, "deleted": True})
