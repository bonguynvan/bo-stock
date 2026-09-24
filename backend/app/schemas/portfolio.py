"""Portfolio schemas (research-only holdings tracking)."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PositionCreate(BaseModel):
    symbol: str
    quantity: float = Field(gt=0)
    avg_cost: float = Field(gt=0)  # VND per share
    note: str | None = None
    opened_at: str | None = None  # ISO date

    @field_validator("symbol")
    @classmethod
    def _upper(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not v:
            raise ValueError("symbol required")
        return v


class PositionUpdate(BaseModel):
    quantity: float | None = Field(default=None, gt=0)
    avg_cost: float | None = Field(default=None, gt=0)
    note: str | None = None
    opened_at: str | None = None


class PositionOut(BaseModel):
    id: int
    symbol: str
    quantity: float
    avg_cost: float
    note: str | None = None
    opened_at: str | None = None
    created_at: str | None = None


class Holding(BaseModel):
    id: int
    symbol: str
    company_name: str | None = None
    industry: str | None = None
    exchange: str | None = None
    quantity: float
    avg_cost: float
    price: float | None = None
    dividend_yield: float | None = None
    pe: float | None = None
    roe: float | None = None
    market_value: float | None = None
    cost_basis: float
    pnl: float | None = None
    pnl_pct: float | None = None
    weight: float | None = None  # % of total value
    compass: dict | None = None  # {short, mid, long}
    note: str | None = None


class AllocationSlice(BaseModel):
    label: str
    value: float
    pct: float
    count: int


class PortfolioTotals(BaseModel):
    market_value: float
    cost_basis: float
    pnl: float
    pnl_pct: float | None
    positions: int
    priced: int  # how many holdings have a current price


class PortfolioAnalysis(BaseModel):
    holdings: list[Holding]
    totals: PortfolioTotals
    allocation_sector: list[AllocationSlice]
    allocation_exchange: list[AllocationSlice]
    unpriced: list[str]  # symbols with no synced price
    disclaimer: str
