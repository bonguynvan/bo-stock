"""Investment journal: the user's own buy/sell/watch thesis notes.

Research-only: these are personal notes (thesis, expected price, catalyst), not
orders, positions, or system-generated advice. No quantity / P&L here.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Optional link to a stock (not an FK — keep free notes / delisted symbols).
    symbol: Mapped[str | None] = mapped_column(String(10), index=True)
    action: Mapped[str] = mapped_column(String(10))  # buy / sell / watch / note
    thesis: Mapped[str] = mapped_column(Text)
    target_price: Mapped[float | None] = mapped_column(Float)
    catalyst: Mapped[str | None] = mapped_column(Text)
    # Snapshot of close price when the entry was written, for later review.
    price_at_entry: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(10), default="open")  # open / closed
    review_note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
