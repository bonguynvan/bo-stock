"""Investment journal CRUD (single-user, no auth).

Personal thesis notes — research-only, not orders/positions/advice.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import JournalEntry
from app.schemas.journal import JournalCreate, JournalOut, JournalUpdate
from app.schemas.stock import Envelope
from app.services.stock_service import latest_close_price

router = APIRouter(prefix="/journal", tags=["journal"])


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _to_out(e: JournalEntry) -> JournalOut:
    return JournalOut(
        id=e.id,
        symbol=e.symbol,
        action=e.action,
        thesis=e.thesis,
        target_price=e.target_price,
        catalyst=e.catalyst,
        price_at_entry=e.price_at_entry,
        status=e.status,
        review_note=e.review_note,
        created_at=_iso(e.created_at),
        updated_at=_iso(e.updated_at),
        reviewed_at=_iso(e.reviewed_at),
    )


@router.post("", response_model=Envelope[JournalOut])
async def create_entry(
    req: JournalCreate,
    db: AsyncSession = Depends(get_db),
) -> Envelope[JournalOut]:
    symbol = req.normalized_symbol()
    price = await latest_close_price(db, symbol) if symbol else None
    row = JournalEntry(
        symbol=symbol,
        action=req.action,
        thesis=req.thesis,
        target_price=req.target_price,
        catalyst=req.catalyst,
        price_at_entry=price,
        status="open",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.get("", response_model=Envelope[list[JournalOut]])
async def list_entries(
    symbol: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Envelope[list[JournalOut]]:
    stmt = (
        select(JournalEntry)
        .order_by(JournalEntry.created_at.desc())
    )
    if symbol:
        stmt = stmt.where(JournalEntry.symbol == symbol.upper())
    rows = (await db.execute(stmt)).scalars().all()
    return Envelope(data=[_to_out(e) for e in rows])


@router.put("/{entry_id}", response_model=Envelope[JournalOut])
async def update_entry(
    entry_id: int,
    req: JournalUpdate,
    db: AsyncSession = Depends(get_db),
) -> Envelope[JournalOut]:
    row = (
        await db.execute(
            select(JournalEntry).where(
                JournalEntry.id == entry_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    data = req.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)
    # Stamp the review time the first time a review note is added.
    if "review_note" in data and data["review_note"] and row.reviewed_at is None:
        row.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.delete("/{entry_id}", response_model=Envelope[dict])
async def delete_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    result = await db.execute(
        delete(JournalEntry).where(
            JournalEntry.id == entry_id
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return Envelope(data={"id": entry_id, "deleted": True})
