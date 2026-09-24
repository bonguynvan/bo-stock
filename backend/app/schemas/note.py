"""Schemas for free-form research notes."""
from __future__ import annotations

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    symbol: str | None = Field(default=None, max_length=10)
    content: str = Field(min_length=1, max_length=20_000)


class NoteUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=20_000)


class NoteOut(BaseModel):
    id: int
    symbol: str | None
    content: str
    created_at: str | None
    updated_at: str | None
