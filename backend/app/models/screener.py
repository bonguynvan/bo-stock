"""Persisted screener presets (supports the UI's "Lưu Bộ Lọc" action)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SavedFilter(Base):
    """A saved screen: a named set of screener filter params ("Lưu Bộ Lọc")."""

    __tablename__ = "saved_filters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    criteria: Mapped[dict] = mapped_column(JSON)  # ScreenerRequest payload
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Watchlist(Base):
    """A named list of symbols (single-user, no auth). symbols stored as a JSON
    array of strings — portable across Postgres/SQLite and consistent with the
    saved-filter JSON pattern."""

    __tablename__ = "watchlist"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    symbols: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
