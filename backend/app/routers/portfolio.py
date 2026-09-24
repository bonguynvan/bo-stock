"""Portfolio CRUD + analysis (single-user, no auth).

Research-only: manual position tracking → value/P&L/allocation. No orders, no advice.
"""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Position, User
from app.routers.auth import get_current_user
from app.schemas.portfolio import (
    PortfolioAnalysis,
    PositionCreate,
    PositionOut,
    PositionUpdate,
)
from app.schemas.stock import Envelope
from app.services import portfolio, portfolio_risk

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _iso(dt: datetime | date | None) -> str | None:
    return dt.isoformat() if dt else None


def _to_out(p: Position) -> PositionOut:
    return PositionOut(
        id=p.id, symbol=p.symbol, quantity=p.quantity, avg_cost=p.avg_cost,
        note=p.note, opened_at=_iso(p.opened_at), created_at=_iso(p.created_at),
    )


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


@router.get("/analysis", response_model=Envelope[PortfolioAnalysis])
async def analysis(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[PortfolioAnalysis]:
    return Envelope(data=await portfolio.get_analysis(db, user.id))


@router.get("/risk", response_model=Envelope[dict])
async def risk_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    """Portfolio risk stats (volatility/Sharpe/drawdown/VaR + correlations). Research-only."""
    return Envelope(data=await portfolio_risk.get_portfolio_risk(db, user.id))


@router.get("", response_model=Envelope[list[PositionOut]])
async def list_positions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list[PositionOut]]:
    rows = (
        await db.execute(
            select(Position)
            .where(Position.user_id == user.id)
            .order_by(Position.created_at)
        )
    ).scalars().all()
    return Envelope(data=[_to_out(p) for p in rows])


@router.post("", response_model=Envelope[PositionOut])
async def create_position(
    req: PositionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[PositionOut]:
    row = Position(
        symbol=req.symbol, quantity=req.quantity, avg_cost=req.avg_cost,
        note=req.note, opened_at=_parse_date(req.opened_at), user_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.put("/{position_id}", response_model=Envelope[PositionOut])
async def update_position(
    position_id: int,
    req: PositionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[PositionOut]:
    row = (
        await db.execute(
            select(Position).where(
                Position.id == position_id, Position.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Position not found")
    data = req.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, _parse_date(value) if field == "opened_at" else value)
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


@router.delete("/{position_id}", response_model=Envelope[dict])
async def delete_position(
    position_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    result = await db.execute(
        delete(Position).where(
            Position.id == position_id, Position.user_id == user.id
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Position not found")
    return Envelope(data={"id": position_id, "deleted": True})
