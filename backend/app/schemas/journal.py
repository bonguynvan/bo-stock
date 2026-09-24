"""Investment journal request/response schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

JournalAction = Literal["buy", "sell", "watch", "note"]
JournalStatus = Literal["open", "closed"]


class JournalCreate(BaseModel):
    symbol: str | None = Field(default=None, max_length=10)
    action: JournalAction
    thesis: str = Field(min_length=1)
    target_price: float | None = None
    catalyst: str | None = None

    def normalized_symbol(self) -> str | None:
        s = (self.symbol or "").strip().upper()
        return s or None


class JournalUpdate(BaseModel):
    action: JournalAction | None = None
    thesis: str | None = Field(default=None, min_length=1)
    target_price: float | None = None
    catalyst: str | None = None
    status: JournalStatus | None = None
    review_note: str | None = None


class JournalOut(BaseModel):
    id: int
    symbol: str | None
    action: str
    thesis: str
    target_price: float | None
    catalyst: str | None
    price_at_entry: float | None
    status: str
    review_note: str | None
    created_at: str | None = None
    updated_at: str | None = None
    reviewed_at: str | None = None
