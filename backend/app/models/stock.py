"""ORM models for stocks and their periodic fundamental metrics."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"

    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    company_name: Mapped[str | None] = mapped_column(String(255))
    exchange: Mapped[str | None] = mapped_column(String(10))  # HOSE / HNX / UPCOM
    industry: Mapped[str | None] = mapped_column(String(100))
    market_cap: Mapped[int | None] = mapped_column(BigInteger)  # tỷ VND
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    metrics: Mapped[list["StockMetric"]] = relationship(
        back_populates="stock", cascade="all, delete-orphan", lazy="selectin"
    )


class StockMetric(Base):
    __tablename__ = "stock_metrics"
    __table_args__ = (
        UniqueConstraint("symbol", "report_date", "period", name="uq_metric_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(
        String(10), ForeignKey("stocks.symbol", ondelete="CASCADE"), index=True
    )
    report_date: Mapped[date | None] = mapped_column(Date)
    period: Mapped[str | None] = mapped_column(String(10))  # quarterly / yearly

    # Valuation
    pe: Mapped[float | None] = mapped_column(Float)
    pb: Mapped[float | None] = mapped_column(Float)
    ev_ebitda: Mapped[float | None] = mapped_column(Float)

    # Profitability
    roe: Mapped[float | None] = mapped_column(Float)
    roa: Mapped[float | None] = mapped_column(Float)
    gross_margin: Mapped[float | None] = mapped_column(Float)
    net_margin: Mapped[float | None] = mapped_column(Float)

    # Growth (YoY)
    revenue_growth: Mapped[float | None] = mapped_column(Float)
    eps_growth: Mapped[float | None] = mapped_column(Float)
    profit_growth: Mapped[float | None] = mapped_column(Float)

    # Financial health
    debt_equity: Mapped[float | None] = mapped_column(Float)
    current_ratio: Mapped[float | None] = mapped_column(Float)
    free_cash_flow: Mapped[int | None] = mapped_column(BigInteger)

    # Market
    avg_volume_30d: Mapped[int | None] = mapped_column(BigInteger)
    close_price: Mapped[float | None] = mapped_column(Float)
    change_pct: Mapped[float | None] = mapped_column(Float)
    dividend_yield: Mapped[float | None] = mapped_column(Float)

    # Extended fundamentals (detail panel)
    charter_capital: Mapped[int | None] = mapped_column(BigInteger)
    eps_trailing: Mapped[float | None] = mapped_column(Float)
    cash: Mapped[int | None] = mapped_column(BigInteger)

    # TCBS proprietary / computed scores
    tcbs_score: Mapped[float | None] = mapped_column(Float)
    valuation_score: Mapped[float | None] = mapped_column(Float)
    financial_health_score: Mapped[float | None] = mapped_column(Float)
    quant_score: Mapped[float | None] = mapped_column(Float)  # 0-100

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    stock: Mapped["Stock"] = relationship(back_populates="metrics")
