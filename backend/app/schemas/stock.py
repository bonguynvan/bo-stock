"""Pydantic v2 schemas mirroring docs/API_CONTRACT.md."""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    success: bool = True
    data: T | None = None
    error: str | None = None
    meta: dict[str, Any] | None = None


class OhlcBar(BaseModel):
    time: str  # YYYY-MM-DD
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: float | None = None


class StockResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol: str
    company_name: str | None = None
    exchange: str | None = None
    industry: str | None = None
    market_cap: int | None = None
    close_price: float | None = None
    change_pct: float | None = None
    pe: float | None = None
    pb: float | None = None
    roe: float | None = None
    roa: float | None = None
    net_margin: float | None = None
    revenue_growth: float | None = None
    eps_growth: float | None = None
    debt_equity: float | None = None
    current_ratio: float | None = None
    dividend_yield: float | None = None
    avg_volume_30d: int | None = None
    pe_vs_hist: float | None = None  # % current P/E vs own 5yr-avg P/E (neg = cheaper)
    compass_long: float | None = None  # Compass long-term (DB-only; universe-wide)
    beneish_flag: str | None = None  # Beneish manipulation flag (high/medium/low_risk)
    earnings_quality_flag: str | None = None  # QoE flag (strong/adequate/weak/insufficient_data)
    earnings_quality_score: float | None = None  # QoE 0-100 (higher = better)
    # Financial-trust overall from persisted forensic+QoE (no valuation pillar); the
    # per-stock card is the richer version. solid|mixed|watch|elevated_risk|insufficient
    conviction_overall: str | None = None
    quant_score: float | None = None
    quant_grade: str | None = None
    updated_at: str | None = None


class QuarterlyPoint(BaseModel):
    period: str
    value: float


class OwnershipEntry(BaseModel):
    name: str
    pct: float


class StockDetail(StockResult):
    charter_capital: int | None = None
    eps_trailing: float | None = None
    profit_growth: float | None = None
    cash: int | None = None
    quarterly_profit: list[QuarterlyPoint] = []
    ownership: list[OwnershipEntry] = []
    tags: list[str] = []
