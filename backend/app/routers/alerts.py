"""Watchlist alerts — single-user threshold rules + current triggers (research-only)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AlertStore, Position, User, Watchlist
from app.routers.auth import get_current_user
from app.schemas.stock import Envelope
from app.services import alerts, signal_radar
from app.services.stock_service import metrics_for_symbols

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertsUpdate(BaseModel):
    rules: list


async def _get_or_create(db: AsyncSession, user_id: int) -> AlertStore:
    row = (
        await db.execute(
            select(AlertStore)
            .where(AlertStore.user_id == user_id)
            .order_by(AlertStore.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        row = AlertStore(rules=[], user_id=user_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _out(row: AlertStore) -> dict:
    return {
        "rules": alerts.normalize_rules(row.rules),
        "metrics": list(alerts.ALLOWED_METRICS),
        "ops": alerts.OPS,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("", response_model=Envelope[dict])
async def get_alerts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    return Envelope(data=_out(await _get_or_create(db, user.id)))


_MAX_RULES = 200


@router.put("", response_model=Envelope[dict])
async def update_alerts(
    body: AlertsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    if len(body.rules) > _MAX_RULES:
        raise HTTPException(status_code=400, detail=f"Tối đa {_MAX_RULES} quy tắc.")
    row = await _get_or_create(db, user.id)
    row.rules = alerts.normalize_rules(body.rules)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_out(row))


async def _followed_symbols(db: AsyncSession, user_id: int) -> list[str]:
    """Union of the user's watchlist symbols + open portfolio positions."""
    wls = (
        await db.execute(select(Watchlist).where(Watchlist.user_id == user_id))
    ).scalars().all()
    syms: set[str] = set()
    for w in wls:
        syms.update(s.upper() for s in (w.symbols or []) if s)
    positions = (
        await db.execute(
            select(Position.symbol).where(Position.user_id == user_id)
        )
    ).scalars().all()
    syms.update(s.upper() for s in positions if s)
    return sorted(syms)


@router.get("/radar-watch", response_model=Envelope[list])
async def radar_watch(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list]:
    """Followed symbols (watchlists ∪ portfolio) currently on the risk radar (no AI).

    Turns the radar proactive: the forensic/QoE flags come to the names you follow."""
    followed = await _followed_symbols(db, user.id)
    flagged = await signal_radar.flagged_among(db, followed)
    return Envelope(data=flagged, meta={"followed": len(followed), "flagged": len(flagged)})


@router.get("/triggered", response_model=Envelope[list])
async def triggered(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list]:
    """Rules currently firing, evaluated against the latest metrics of their symbols."""
    row = await _get_or_create(db, user.id)
    rules = alerts.normalize_rules(row.rules)
    symbols = sorted({r["symbol"] for r in rules})
    results = await metrics_for_symbols(db, symbols) if symbols else []
    values = {r.symbol: r.model_dump() for r in results}
    fired = alerts.evaluate_rules(rules, values)
    return Envelope(data=fired, meta={"rules": len(rules), "fired": len(fired)})
