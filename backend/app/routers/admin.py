"""Admin-only endpoints (waitlist review + simple stats). Gated by is_admin."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, WaitlistEntry
from app.routers.auth import get_current_user
from app.schemas.stock import Envelope

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Like get_current_user, but 403 unless the account is an admin."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên.")
    return user


@router.get("/waitlist", response_model=Envelope[list[dict]])
async def list_waitlist(
    db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)
) -> Envelope[list[dict]]:
    rows = (
        await db.execute(select(WaitlistEntry).order_by(WaitlistEntry.created_at.desc()))
    ).scalars().all()
    data = [
        {"id": r.id, "email": r.email, "note": r.note,
         "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows
    ]
    return Envelope(data=data, meta={"count": len(data)})


@router.get("/stats", response_model=Envelope[dict])
async def stats(
    db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)
) -> Envelope[dict]:
    users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    waitlist = (await db.execute(select(func.count()).select_from(WaitlistEntry))).scalar_one()
    return Envelope(data={"users": users, "waitlist": waitlist})
