"""Circuit-breaker behaviour for the resilient daily price sync."""
from __future__ import annotations

from app.services import data_fetcher


class _RateLimitedProvider:
    async def fetch_ohlc(self, symbol: str, count: int = 35):
        raise RuntimeError("Client error '429 Too Many Requests'")

    async def aclose(self) -> None:
        pass


def test_is_rate_limited_detects_waf_markers() -> None:
    assert data_fetcher._is_rate_limited(RuntimeError("429 Too Many Requests"))
    assert data_fetcher._is_rate_limited(Exception("HTTP 403 Forbidden"))
    assert not data_fetcher._is_rate_limited(RuntimeError("connection reset by peer"))


async def test_circuit_breaker_stops_and_reports(session, monkeypatch) -> None:
    monkeypatch.setattr(data_fetcher, "get_provider", lambda: _RateLimitedProvider())
    res = await data_fetcher.sync_prices_resilient(session, [f"S{i}" for i in range(10)])
    assert res["circuit_broken"] is True          # stopped, didn't hammer all 10
    assert res["stopped_at"] is not None
    assert res["updated"] == 0                     # nothing refreshed (all rate-limited)
