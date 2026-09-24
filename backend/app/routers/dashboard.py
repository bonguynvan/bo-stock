"""Single-user terminal dashboard layout (which HOME tiles show + order)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DashboardLayout, User
from app.routers.auth import get_current_user
from app.schemas.dashboard import DashboardLayoutOut, DashboardLayoutUpdate
from app.schemas.stock import Envelope
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _get_or_create(db: AsyncSession, user_id: int) -> DashboardLayout:
    row = (
        await db.execute(
            select(DashboardLayout)
            .where(DashboardLayout.user_id == user_id)
            .order_by(DashboardLayout.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        row = DashboardLayout(tiles=list(dashboard.DEFAULT_TILES), user_id=user_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _to_out(row: DashboardLayout) -> DashboardLayoutOut:
    return DashboardLayoutOut(
        tiles=dashboard.normalize_tiles(row.tiles),
        allowed=dashboard.allowed_tiles(),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.get("/layout", response_model=Envelope[DashboardLayoutOut])
async def get_layout(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[DashboardLayoutOut]:
    return Envelope(data=_to_out(await _get_or_create(db, user.id)))


@router.put("/layout", response_model=Envelope[DashboardLayoutOut])
async def update_layout(
    body: DashboardLayoutUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[DashboardLayoutOut]:
    row = await _get_or_create(db, user.id)
    row.tiles = dashboard.normalize_tiles(body.tiles)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))
