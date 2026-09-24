"""Pure sliding-window rate-limiter tests (injected clock, no real sleep)."""
from __future__ import annotations

from app.services import ratelimit


def test_allows_up_to_limit_then_blocks_within_window() -> None:
    ratelimit.reset()
    assert ratelimit.allow("k", limit=3, window_sec=60, now=0.0) is True
    assert ratelimit.allow("k", limit=3, window_sec=60, now=1.0) is True
    assert ratelimit.allow("k", limit=3, window_sec=60, now=2.0) is True
    assert ratelimit.allow("k", limit=3, window_sec=60, now=3.0) is False  # 4th within window


def test_window_slides_and_rejections_do_not_consume() -> None:
    ratelimit.reset()
    assert ratelimit.allow("k", limit=1, window_sec=10, now=0.0) is True
    assert ratelimit.allow("k", limit=1, window_sec=10, now=5.0) is False  # blocked, no slot used
    # after the first hit ages out (>10s), a new hit is allowed again
    assert ratelimit.allow("k", limit=1, window_sec=10, now=11.0) is True


def test_keys_are_independent() -> None:
    ratelimit.reset()
    assert ratelimit.allow("a", limit=1, window_sec=60, now=0.0) is True
    assert ratelimit.allow("b", limit=1, window_sec=60, now=0.0) is True  # different key
