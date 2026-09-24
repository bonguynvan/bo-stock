"""Tests for the new indicators (SMA/RSI/ATR) + the technicals bundle. Pure/DB-free."""
from __future__ import annotations

from app.services import indicators
from app.services.technicals import build_technicals


class TestNewIndicators:
    def test_sma(self) -> None:
        assert indicators.sma([1, 2, 3, 4], 2) == 3.5
        assert indicators.sma([1, 2], 5) is None

    def test_rsi_all_gains_is_100(self) -> None:
        rising = [float(i) for i in range(1, 30)]
        assert indicators.rsi(rising, 14) == 100.0

    def test_rsi_all_losses_is_0(self) -> None:
        falling = [float(i) for i in range(30, 1, -1)]
        assert indicators.rsi(falling, 14) == 0.0

    def test_rsi_mid_range_between_0_and_100(self) -> None:
        prices = [10, 11, 10.5, 11.2, 10.8, 11.5, 11.1, 11.8, 11.4, 12.0,
                  11.7, 12.3, 12.0, 12.5, 12.1]
        r = indicators.rsi(prices, 14)
        assert r is not None and 0 < r < 100

    def test_rsi_too_few_bars(self) -> None:
        assert indicators.rsi([1, 2, 3], 14) is None

    def test_atr_positive(self) -> None:
        highs = [float(i) + 1 for i in range(20)]
        lows = [float(i) - 1 for i in range(20)]
        closes = [float(i) for i in range(20)]
        a = indicators.atr(highs, lows, closes, 14)
        assert a is not None and a > 0

    def test_atr_too_few_bars(self) -> None:
        assert indicators.atr([1, 2], [0, 1], [0.5, 1.5], 14) is None


def _bar(c: float) -> dict:
    return {"time": "2025-01-01", "open": c, "high": c + 1, "low": c - 1, "close": c, "volume": 1000}


class TestBuildTechnicals:
    def test_insufficient_bars(self) -> None:
        out = build_technicals([_bar(10)])
        assert out["available"] is False
        assert out["bars_used"] == 1

    def test_full_bundle_shape(self) -> None:
        bars = [_bar(100 + i * 0.5) for i in range(60)]  # 60 rising bars
        out = build_technicals(bars)
        assert out["available"] is True
        assert out["bars_used"] == 60
        assert out["sma20"] is not None and out["sma50"] is not None
        assert 0 <= out["rsi14"] <= 100
        assert set(out["macd"]) == {"line", "signal", "hist"}
        assert set(out["bollinger"]) == {"upper", "middle", "lower", "percent_b", "width"}
        assert out["atr14"] is not None
        assert out["week52"]["high"] >= out["week52"]["low"]

    def test_skips_null_closes(self) -> None:
        bars = [_bar(10), {"close": None, "high": None, "low": None}, _bar(12)]
        out = build_technicals(bars)
        assert out["bars_used"] == 2
