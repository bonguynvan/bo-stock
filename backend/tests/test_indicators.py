"""Unit tests for the pure technical indicators."""
from __future__ import annotations

from app.services.indicators import (
    band_width,
    bollinger_bands,
    ema,
    macd,
    percent_b,
    position_in_range,
    week_52_range,
)


def test_ema_seeds_with_sma_and_smooths() -> None:
    prices = [float(i) for i in range(1, 11)]  # 1..10
    e = ema(prices, 5)
    assert e[3] == 0.0  # before period start
    assert e[4] == 3.0  # SMA of 1..5
    assert e[5] > e[4]  # rising series → EMA rises
    assert e[-1] < prices[-1]  # EMA lags the latest price


def test_macd_none_when_too_few_bars() -> None:
    assert macd([1.0] * 30) == (None, None, None)


def test_macd_positive_histogram_on_accelerating_uptrend() -> None:
    # An accelerating trend has rising momentum → MACD leads its signal.
    prices = [float(i * i) for i in range(1, 60)]
    m, s, hist = macd(prices)
    assert m is not None and s is not None and hist is not None
    assert m > s  # MACD above signal when momentum is increasing
    assert hist > 0


def test_macd_flat_on_linear_trend() -> None:
    # A perfectly linear ramp has constant momentum → MACD equals its signal.
    m, s, hist = macd([float(i) for i in range(1, 60)])
    assert hist == 0.0


def test_bollinger_bands_and_width() -> None:
    prices = [10.0, 11.0, 12.0, 11.0, 10.0] * 4  # 20 bars, mean 10.8
    upper, middle, lower = bollinger_bands(prices, 20, 2.0)
    assert middle == 10.8
    assert upper > middle > lower
    bw = band_width(upper, middle, lower)
    assert bw is not None and bw > 0


def test_bollinger_too_few_bars() -> None:
    assert bollinger_bands([1.0, 2.0], 20) == (None, None, None)


def test_percent_b_positions() -> None:
    assert percent_b(15, 20, 10) == 0.5  # midpoint
    assert percent_b(20, 20, 10) == 1.0  # at upper
    assert percent_b(10, 20, 10) == 0.0  # at lower
    assert percent_b(15, None, None) is None


def test_week_52_range_and_position() -> None:
    highs = [10.0, 12.0, 15.0, 11.0]
    lows = [8.0, 9.0, 7.0, 10.0]
    hi, lo = week_52_range(highs, lows)
    assert hi == 15.0 and lo == 7.0
    assert position_in_range(11.0, hi, lo) == 50.0  # midpoint of 7..15
    assert position_in_range(15.0, hi, lo) == 100.0
    assert position_in_range(11.0, None, None) is None
