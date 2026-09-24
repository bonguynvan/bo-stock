"""Per-year fundamental history (real ROE series and peers).

VCI's ``statistics-financial`` response already carries ~8 yearly ``RATIO_YEAR``
records per company; the snapshot parser keeps only the latest and discards them.
This table persists that yearly series so Compass and Valuation can reason about a
real ROE trend/consistency instead of an EPS-growth proxy — at zero extra HTTP cost
(it rides on the existing metrics sync). One row per (symbol, year).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricHistory(Base):
    __tablename__ = "metric_history"
    __table_args__ = (
        UniqueConstraint("symbol", "year", name="uq_metric_history_year"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(
        String(10), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True
    )
    year: Mapped[int] = mapped_column(Integer)

    roe: Mapped[float | None] = mapped_column(Float)  # percent
    roa: Mapped[float | None] = mapped_column(Float)  # percent
    net_margin: Mapped[float | None] = mapped_column(Float)  # percent
    gross_margin: Mapped[float | None] = mapped_column(Float)  # percent
    pe: Mapped[float | None] = mapped_column(Float)
    pb: Mapped[float | None] = mapped_column(Float)
    eps: Mapped[float | None] = mapped_column(Float)  # VND/share (derived price/pe)
    bvps: Mapped[float | None] = mapped_column(Float)  # VND/share (derived price/pb)
    dividend_yield: Mapped[float | None] = mapped_column(Float)  # percent

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
