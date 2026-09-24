"""Portfolio positions — the user's OWN holdings, entered manually.

Research-only: this tracks quantity + average cost so the tool can show current
value, unrealized P&L, weight, and allocation for research. It does NOT connect to a
broker, place orders, or advise buy/sell — the user types what they hold.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Not an FK — keep flexible for delisted / not-yet-synced tickers.
    symbol: Mapped[str] = mapped_column(String(10), index=True)
    quantity: Mapped[float] = mapped_column(Float)  # shares
    avg_cost: Mapped[float] = mapped_column(Float)  # VND per share
    note: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
