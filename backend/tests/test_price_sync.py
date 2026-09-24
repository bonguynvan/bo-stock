"""Unit tests for price/volume metric computation (pure)."""
from __future__ import annotations

from app.services.data_fetcher import compute_price_metrics


def _bar(close, volume):
    return {"time": "2026-01-01", "open": close, "high": close, "low": close,
            "close": close, "volume": volume}


def test_avg_volume_uses_last_30_bars_and_day_change() -> None:
    # 31 bars: volumes 1..31; last 30 = 2..31 → mean 16.5 → round 16 (banker's)
    bars = [_bar(100 + i, i) for i in range(1, 32)]
    bars[-1]["close"] = 110
    bars[-2]["close"] = 100  # +10% day change
    m = compute_price_metrics(bars)
    assert m["close_price"] == 110
    assert m["change_pct"] == 10.0
    # mean of volumes 2..31 = 16.5
    assert m["avg_volume_30d"] in (16, 17)  # rounding


def test_handles_short_history_and_nulls() -> None:
    m = compute_price_metrics([_bar(50, 1000)])
    assert m["close_price"] == 50
    assert "change_pct" not in m  # need >=2 closes
    assert m["avg_volume_30d"] == 1000

    assert compute_price_metrics([]) == {}


def test_negative_day_change() -> None:
    m = compute_price_metrics([_bar(100, 5), _bar(80, 5)])
    assert m["change_pct"] == -20.0
