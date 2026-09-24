"""Provider interface and normalized data shapes."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class FetchedStock:
    symbol: str
    company_name: str | None = None
    exchange: str | None = None
    industry: str | None = None
    market_cap: int | None = None  # tỷ VND


@dataclass
class FetchedMetrics:
    """Normalized metrics for one symbol, mapped onto StockMetric columns."""

    symbol: str
    report_date: date | None = None
    period: str | None = "quarterly"

    pe: float | None = None
    pb: float | None = None
    ev_ebitda: float | None = None
    roe: float | None = None
    roa: float | None = None
    gross_margin: float | None = None
    net_margin: float | None = None
    revenue_growth: float | None = None
    eps_growth: float | None = None
    profit_growth: float | None = None
    debt_equity: float | None = None
    current_ratio: float | None = None
    free_cash_flow: int | None = None
    avg_volume_30d: int | None = None
    close_price: float | None = None
    change_pct: float | None = None
    dividend_yield: float | None = None
    market_cap: int | None = None  # tỷ VND — providers may supply it with metrics
    industry: str | None = None  # providers may enrich the Stock row from metrics
    company_name: str | None = None
    charter_capital: int | None = None
    eps_trailing: float | None = None
    cash: int | None = None
    tcbs_score: float | None = None
    valuation_score: float | None = None
    financial_health_score: float | None = None

    # Detail-only extras (not persisted as columns in Phase 1)
    quarterly_profit: list[dict] = field(default_factory=list)
    ownership: list[dict] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    # Per-year ratio series (persisted to metric_history, not stock_metrics).
    ratio_history: list[dict] = field(default_factory=list)


@runtime_checkable
class DataProvider(Protocol):
    name: str

    async def fetch_stock_list(self) -> list[FetchedStock]: ...

    async def fetch_stock_metrics(self, symbol: str) -> FetchedMetrics: ...
