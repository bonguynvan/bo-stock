"""Watchlist request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


def normalize_symbols(symbols: list[str] | None) -> list[str] | None:
    """Upper-case, trim, drop blanks, de-dupe (order-preserving). None passes through."""
    if symbols is None:
        return None
    seen: set[str] = set()
    out: list[str] = []
    for s in symbols:
        sym = (s or "").strip().upper()
        if sym and sym not in seen:
            seen.add(sym)
            out.append(sym)
    return out


class WatchlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    symbols: list[str] = Field(default_factory=list)

    @field_validator("symbols")
    @classmethod
    def _norm(cls, v: list[str]) -> list[str]:
        return normalize_symbols(v) or []


class WatchlistUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    symbols: list[str] | None = None

    @field_validator("symbols")
    @classmethod
    def _norm(cls, v: list[str] | None) -> list[str] | None:
        return normalize_symbols(v)


class WatchlistOut(BaseModel):
    id: int
    name: str
    symbols: list[str]
    created_at: str | None = None
