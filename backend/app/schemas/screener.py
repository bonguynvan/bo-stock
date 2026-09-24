"""Screener request schema (POST /screener/filter)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SORTABLE_FIELDS = {
    "quant_score",
    "market_cap",
    "close_price",
    "change_pct",
    "pe",
    "pb",
    "roe",
    "roa",
    "net_margin",
    "revenue_growth",
    "eps_growth",
    "debt_equity",
    "current_ratio",
    "dividend_yield",
    "avg_volume_30d",
    "pe_vs_hist",
}


class ScreenerRequest(BaseModel):
    sector: str | None = None
    exchange: list[str] | None = None

    pe_max: float | None = None
    pb_max: float | None = None
    roe_min: float | None = None
    roa_min: float | None = None
    revenue_growth_min: float | None = None
    market_cap_min: int | None = None  # tỷ VND
    avg_volume_30d_min: int | None = None
    debt_equity_max: float | None = None
    dividend_yield_min: float | None = None
    # "Rẻ so với lịch sử": current P/E at most this % vs the stock's own 5yr-avg P/E
    # (e.g. -10 → trading ≥10% below its historical average multiple).
    pe_vs_hist_max: float | None = None
    # Hide symbols the Beneish model flags as high manipulation risk.
    exclude_beneish_high_risk: bool = False
    # Hide symbols whose Quality-of-Earnings is flagged weak (accrual-driven profit).
    exclude_weak_earnings_quality: bool = False

    limit: int = Field(default=50, ge=1, le=2000)
    sort_by: str = "quant_score"
    sort_order: Literal["asc", "desc"] = "desc"

    def safe_sort_by(self) -> str:
        return self.sort_by if self.sort_by in SORTABLE_FIELDS else "quant_score"


class SaveFilterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    criteria: ScreenerRequest
