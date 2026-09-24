"""Single-row alert store — user-defined threshold rules over stock metrics.

Single-user (mirrors ``dashboard_layout``/``playbook``). ``rules`` is a JSON list of
{id, symbol, metric, op, value, note}. Research-only: rules surface flags when a metric
crosses a threshold — never an order or a recommendation.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

_JSON = JSON().with_variant(JSONB, "postgresql")


class AlertStore(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rules: Mapped[list] = mapped_column(_JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
