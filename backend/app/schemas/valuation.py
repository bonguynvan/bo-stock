"""Valuation request schema (DCF assumptions are user-supplied)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ValuationDcfBody(BaseModel):
    growth_rate: float = Field(ge=-50, le=100)  # % annual OCF growth
    discount_rate: float = Field(default=13.0, ge=1, le=50)  # % WACC/discount
    years: int = Field(default=5, ge=1, le=15)
