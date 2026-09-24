"""Single-row dashboard layout — which terminal HOME tiles show, and in what order.

Single-user (no auth), mirroring the ``playbook`` single-row pattern. ``tiles`` is an
ordered JSON list of tile keys; hidden tiles are simply absent from the list.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# JSONB on Postgres (real DB via migration), generic JSON on SQLite (test fixture).
_JSON = JSON().with_variant(JSONB, "postgresql")


class DashboardLayout(Base):
    __tablename__ = "dashboard_layout"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    tiles: Mapped[list] = mapped_column(_JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
