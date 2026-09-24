"""Cached Investment Compass scores (per symbol) for the screener badge.

Populated when a BCTC is analyzed or its detail is viewed — NOT recomputed on every
table load and NEVER via a batch AI call. A symbol with no row simply has no analyzed
BCTC yet (badge shows "—").
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CompassScore(Base):
    __tablename__ = "compass_scores"

    symbol: Mapped[str] = mapped_column(
        String(10), ForeignKey("stocks.symbol", ondelete="CASCADE"), primary_key=True
    )
    short_score: Mapped[float | None] = mapped_column(Float)
    mid_score: Mapped[float | None] = mapped_column(Float)
    long_score: Mapped[float | None] = mapped_column(Float)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
