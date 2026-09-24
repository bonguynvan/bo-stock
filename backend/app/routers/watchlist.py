"""Watchlist CRUD + metrics (single-user, no auth)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Watchlist
from app.routers.auth import get_current_user
from app.schemas.stock import Envelope, StockResult
from app.schemas.watchlist import WatchlistCreate, WatchlistOut, WatchlistUpdate
from app.services.stock_service import metrics_for_symbols

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


def _to_out(w: Watchlist) -> WatchlistOut:
    return WatchlistOut(
        id=w.id,
        name=w.name,
        symbols=list(w.symbols or []),
        created_at=w.created_at.isoformat() if w.created_at else None,
    )


@router.post("", response_model=Envelope[WatchlistOut])
async def create_watchlist(
    req: WatchlistCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[WatchlistOut]:
    row = Watchlist(name=req.name, symbols=req.symbols, user_id=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.get("", response_model=Envelope[list[WatchlistOut]])
async def list_watchlists(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list[WatchlistOut]]:
    rows = (
        await db.execute(
            select(Watchlist)
            .where(Watchlist.user_id == user.id)
            .order_by(Watchlist.created_at.desc())
        )
    ).scalars().all()
    return Envelope(data=[_to_out(w) for w in rows])


@router.put("/{watchlist_id}", response_model=Envelope[WatchlistOut])
async def update_watchlist(
    watchlist_id: int,
    req: WatchlistUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[WatchlistOut]:
    row = (
        await db.execute(
            select(Watchlist).where(
                Watchlist.id == watchlist_id, Watchlist.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    if req.name is not None:
        row.name = req.name
    if req.symbols is not None:
        row.symbols = req.symbols
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.delete("/{watchlist_id}", response_model=Envelope[dict])
async def delete_watchlist(
    watchlist_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    result = await db.execute(
        delete(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == user.id
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return Envelope(data={"id": watchlist_id, "deleted": True})


@router.get("/{watchlist_id}/metrics", response_model=Envelope[list[StockResult]])
async def watchlist_metrics(
    watchlist_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list[StockResult]]:
    row = (
        await db.execute(
            select(Watchlist).where(
                Watchlist.id == watchlist_id, Watchlist.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    results = await metrics_for_symbols(db, list(row.symbols or []))
    return Envelope(
        data=results,
        meta={"watchlist_id": watchlist_id, "requested": len(row.symbols or []),
              "found": len(results)},
    )
