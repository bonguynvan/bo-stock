"""Raw financial-statement line items (per symbol/period) for the fraud models.

metric_history stores only ratios; the Beneish/Altman/Piotroski formulas need raw
balance-sheet / income / cash-flow figures. This table persists them (tỷ VND) so the
universe scan is pure math with no per-run HTTP. Populated by scripts/statement_sync.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinancialStatement(Base):
    __tablename__ = "financial_statements"
    __table_args__ = (
        UniqueConstraint("symbol", "period", "period_type", name="uq_fin_stmt_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(
        String(10), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True
    )
    period: Mapped[str] = mapped_column(String(10))  # e.g. "2024"
    period_type: Mapped[str] = mapped_column(String(10))  # "year" | "quarter"

    # Balance sheet (tỷ VND)
    current_assets: Mapped[int | None] = mapped_column(BigInteger)
    receivables: Mapped[int | None] = mapped_column(BigInteger)
    ppe: Mapped[int | None] = mapped_column(BigInteger)
    total_assets: Mapped[int | None] = mapped_column(BigInteger)
    total_liabilities: Mapped[int | None] = mapped_column(BigInteger)
    current_liabilities: Mapped[int | None] = mapped_column(BigInteger)
    long_term_liabilities: Mapped[int | None] = mapped_column(BigInteger)
    retained_earnings: Mapped[int | None] = mapped_column(BigInteger)

    # Income statement (tỷ VND)
    revenue: Mapped[int | None] = mapped_column(BigInteger)
    gross_profit: Mapped[int | None] = mapped_column(BigInteger)
    net_income: Mapped[int | None] = mapped_column(BigInteger)
    operating_profit: Mapped[int | None] = mapped_column(BigInteger)  # EBIT proxy
    sga_expense: Mapped[int | None] = mapped_column(BigInteger)

    # Cash flow (tỷ VND)
    operating_cashflow: Mapped[int | None] = mapped_column(BigInteger)
    depreciation: Mapped[int | None] = mapped_column(BigInteger)

    source: Mapped[str] = mapped_column(String(20), default="vci")
    fields_available: Mapped[int] = mapped_column(Integer, default=0)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
