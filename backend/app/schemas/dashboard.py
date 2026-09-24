"""Schemas for the terminal dashboard layout."""
from __future__ import annotations

from pydantic import BaseModel


class DashboardLayoutOut(BaseModel):
    tiles: list[str]
    allowed: list[str]
    updated_at: str | None = None


class DashboardLayoutUpdate(BaseModel):
    tiles: list[str]
