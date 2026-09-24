"""Playbook schemas."""
from __future__ import annotations

from pydantic import BaseModel


class PlaybookOut(BaseModel):
    content: str
    updated_at: str | None = None


class PlaybookUpdate(BaseModel):
    content: str
