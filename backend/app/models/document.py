"""Uploaded financial report (BCTC) documents + their AI analysis.

Research-only: the AI extracts/summarizes figures; it does not advise.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str | None] = mapped_column(String(10), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(512))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    # Provenance when auto-fetched (e.g. Vietstock CDN URL); NULL for manual uploads.
    source_url: Mapped[str | None] = mapped_column(String(512))
    # Reporting period: "annual" | "quarterly" | "interim". NULL for uploads (treated
    # as annual). Only annual reports feed the multi-year valuation series.
    report_period: Mapped[str | None] = mapped_column(String(12))
    # AI analysis result (structured JSON), populated on demand.
    analysis: Mapped[dict | None] = mapped_column(JSON)
    analysis_model: Mapped[str | None] = mapped_column(String(60))
    # "Tóm tắt để cân nhắc" — objective digest synthesized from analysis + valuation
    # + compass (JSON input, cheap). Research-only, no buy/sell.
    consideration_summary: Mapped[dict | None] = mapped_column(JSON)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
