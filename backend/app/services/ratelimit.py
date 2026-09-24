"""Minimal in-process sliding-window rate limiter (no external dep).

Enough for a single-instance private beta — brute-force / spam protection on the auth +
waitlist endpoints. NOT a distributed limiter; revisit (Redis/slowapi) if we scale out.
"""
from __future__ import annotations

import time

from fastapi import Request

_buckets: dict[str, list[float]] = {}


def allow(key: str, limit: int, window_sec: float, now: float | None = None) -> bool:
    """True if ``key`` is under ``limit`` hits within the trailing ``window_sec``.

    A rejected call does NOT consume a slot (so a client under attack can still succeed
    once the window clears). Prunes old timestamps on each call."""
    t = time.time() if now is None else now
    kept = [ts for ts in _buckets.get(key, []) if t - ts < window_sec]
    if len(kept) >= limit:
        _buckets[key] = kept
        return False
    kept.append(t)
    _buckets[key] = kept
    return True


def client_ip(request: Request) -> str:
    """Best-effort client IP (first X-Forwarded-For hop, else the socket peer)."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def reset() -> None:
    """Test helper — clear all buckets."""
    _buckets.clear()
