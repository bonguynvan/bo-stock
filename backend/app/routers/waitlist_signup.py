"""Public waitlist signup — capture landing-page interest (email only)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import WaitlistEntry
from app.schemas.stock import Envelope
from app.services import auth, ratelimit

router = APIRouter(prefix="/waitlist", tags=["waitlist"])

_WAITLIST_LIMIT, _WAITLIST_WINDOW = 5, 3600.0  # 5 signups / hour / IP (anti-spam)


class WaitlistBody(BaseModel):
    email: str = Field(max_length=255)
    note: str | None = Field(default=None, max_length=500)


@router.post("", response_model=Envelope[dict])
async def join_waitlist(
    body: WaitlistBody, request: Request, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    if not ratelimit.allow(
        f"waitlist:{ratelimit.client_ip(request)}", _WAITLIST_LIMIT, _WAITLIST_WINDOW
    ):
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu — thử lại sau.")
    email = auth.normalize_email(body.email)
    if not auth.is_valid_email(email):
        raise HTTPException(status_code=400, detail="Email không hợp lệ.")
    existing = (
        await db.execute(select(WaitlistEntry).where(WaitlistEntry.email == email))
    ).scalar_one_or_none()
    if existing is None:
        db.add(WaitlistEntry(email=email, note=(body.note or None)))
        await db.commit()
    # Idempotent: same response whether new or already-registered (no enumeration).
    return Envelope(data={"ok": True, "email": email})
