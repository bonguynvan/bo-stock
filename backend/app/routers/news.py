"""Market + per-stock news (public RSS, research-only relay of headlines)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Position, Watchlist
from app.schemas.stock import Envelope
from app.services import news

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/market", response_model=Envelope[list[dict]])
async def get_market_news() -> Envelope[list[dict]]:
    return Envelope(data=await news.market_news())


@router.get("/channels", response_model=Envelope[list[dict]])
async def get_news_channels() -> Envelope[list[dict]]:
    """Available multi-source news channels (vn / world / macro)."""
    return Envelope(data=news.list_channels())


@router.get("/channel/{channel}", response_model=Envelope[list[dict]])
async def get_channel_news(channel: str) -> Envelope[list[dict]]:
    """Aggregated news for one channel across its RSS sources."""
    return Envelope(data=await news.channel_news(channel))


@router.get("/symbol/{symbol}", response_model=Envelope[list[dict]])
async def get_symbol_news(symbol: str) -> Envelope[list[dict]]:
    return Envelope(data=await news.symbol_news(symbol))


@router.get("/personalized", response_model=Envelope[list[dict]])
async def get_personalized_news(db: AsyncSession = Depends(get_db)) -> Envelope[list[dict]]:
    """News for the symbols in the user's Portfolio + Watchlists."""
    held = set((await db.execute(select(Position.symbol))).scalars().all())
    for syms in (await db.execute(select(Watchlist.symbols))).scalars().all():
        held.update(syms or [])
    return Envelope(data=await news.personalized_news(sorted(held)))
