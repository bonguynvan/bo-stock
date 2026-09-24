"""Async DB test fixtures.

Provides an in-memory SQLite session (shared connection via StaticPool) seeded
with a small set of stocks whose metrics have known values, so screener
assertions are deterministic. Kept separate from the app's Postgres engine.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Stock, StockMetric, User

# symbol -> (roe, pe, quant_score, market_cap, close_price)
SEED: dict[str, tuple[float, float, float, int, float]] = {
    "AAA": (30.0, 10.0, 90.0, 5000, 25000.0),
    "BBB": (20.0, 8.0, 80.0, 4000, 18000.0),
    "CCC": (10.0, 15.0, 70.0, 3000, 12000.0),
    "DDD": (5.0, 25.0, 60.0, 2000, 9000.0),
    "EEE": (18.0, 12.0, 85.0, 1500, 30000.0),
    "FFF": (12.0, 5.0, 50.0, 800, 6000.0),
}


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
    async with maker() as s:
        for sym, (roe, pe, score, mcap, price) in SEED.items():
            s.add(
                Stock(
                    symbol=sym, company_name=f"{sym} Corp", exchange="HOSE",
                    industry="Test", market_cap=mcap,
                )
            )
            s.add(
                StockMetric(
                    symbol=sym, report_date=date(2024, 3, 31), period="quarterly",
                    roe=roe, pe=pe, pb=1.0, quant_score=score, close_price=price,
                )
            )
        await s.commit()
        yield s
    await engine.dispose()


@pytest_asyncio.fixture
async def user(session) -> User:
    """A persisted User for exercising the per-user (multi-tenant) router functions."""
    u = User(email="test@example.com", password_hash="x")
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u
