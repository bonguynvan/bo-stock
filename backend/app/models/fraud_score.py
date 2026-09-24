"""Per-symbol algorithmic screening scores (Beneish / Altman / Piotroski).

Batch-computed from financial_statements (pure math, no AI). One row per (symbol,
period). A screening layer that runs for every symbol with ≥2 annual periods —
independent of whether a BCTC was ever AI-analyzed.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

# JSONB on Postgres (real DB via migration), generic JSON on SQLite (test fixture).
_JSON = JSON().with_variant(JSONB, "postgresql")

from app.database import Base


class FraudScore(Base):
    __tablename__ = "fraud_scores"
    __table_args__ = (
        UniqueConstraint("symbol", "period", name="uq_fraud_score_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(
        String(10), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True
    )
    period: Mapped[str] = mapped_column(String(10))  # year evaluated (t vs t-1)

    beneish_mscore: Mapped[float | None] = mapped_column(Float)
    beneish_variables_used: Mapped[int | None] = mapped_column(Integer)
    beneish_flag: Mapped[str | None] = mapped_column(String(20))  # high/medium/low_risk | insufficient_data

    altman_zscore: Mapped[float | None] = mapped_column(Float)  # original Z (1968)
    altman_zone: Mapped[str | None] = mapped_column(String(20))  # safe|grey|distress|not_applicable|insufficient_data
    altman_em_zscore: Mapped[float | None] = mapped_column(Float)  # Z'' emerging markets (primary for VN)
    altman_em_zone: Mapped[str | None] = mapped_column(String(20))

    piotroski_fscore: Mapped[int | None] = mapped_column(Integer)  # 0-9
    piotroski_detail: Mapped[dict | None] = mapped_column(_JSON)

    # Quality of Earnings (0-100, higher = better; earnings-vs-cash quality)
    earnings_quality_score: Mapped[float | None] = mapped_column(Float)
    earnings_quality_flag: Mapped[str | None] = mapped_column(String(20))  # strong|adequate|weak|insufficient_data
    earnings_quality_detail: Mapped[dict | None] = mapped_column(_JSON)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
