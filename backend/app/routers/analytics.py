"""Analytics: market context + portfolio analytics (research-only)."""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.stock import Envelope
from app.services import analytics, index_data

logger = logging.getLogger("vnios.analytics")
router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=Envelope[dict])
async def get(db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    return Envelope(data=await analytics.get_analytics(db))


@router.post("/sync-index", response_model=Envelope[dict])
async def sync_index(db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    """Refresh VN-Index / VN30 / HNX daily bars from KBS (public endpoint)."""
    result: dict[str, int] = {}
    for symbol, _ in index_data.INDICES:
        try:
            result[symbol] = await index_data.sync_index(db, symbol)
        except (httpx.HTTPError, Exception) as exc:  # noqa: BLE001
            logger.warning("[index] sync %s failed — %s", symbol, exc)
            result[symbol] = 0
    return Envelope(data=result)
