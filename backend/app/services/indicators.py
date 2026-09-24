"""Technical indicators (pure, DB-free, unit-tested).

Ported from vnmarket-stock's Go ``indicator/calculator.go`` (MACD, EMA, Bollinger
Bands, band width, 52-week range) into Python, plus %B position. Used to enrich the
Compass short-term momentum read beyond MA50/RSI. Research-only: descriptive numbers,
no trade signals.
"""
from __future__ import annotations

import statistics


def ema(prices: list[float], period: int) -> list[float]:
    """Exponential moving average; seeded with the SMA of the first ``period``.

    Returns a list aligned to ``prices`` with 0.0 before the series can start.
    """
    n = len(prices)
    out = [0.0] * n
    if period <= 0 or n < period:
        return out
    out[period - 1] = sum(prices[:period]) / period
    k = 2.0 / (period + 1)
    for i in range(period, n):
        out[i] = prices[i] * k + out[i - 1] * (1 - k)
    return out


def macd(prices: list[float]) -> tuple[float | None, float | None, float | None]:
    """Standard MACD(12,26,9). Returns (macd_line, signal_line, histogram) — latest
    values, or (None, None, None) if there aren't enough bars (needs ≥ 26 + 9)."""
    if len(prices) < 35:
        return None, None, None
    ema12 = ema(prices, 12)
    ema26 = ema(prices, 26)
    macd_line = [a - b for a, b in zip(ema12, ema26)]
    # Signal = EMA9 of the MACD line, but only over the valid tail (from index 25).
    valid = macd_line[25:]
    signal_tail = ema(valid, 9)
    m = macd_line[-1]
    s = signal_tail[-1]
    return round(m, 4), round(s, 4), round(m - s, 4)


def bollinger_bands(
    prices: list[float], period: int = 20, mult: float = 2.0
) -> tuple[float | None, float | None, float | None]:
    """Latest (upper, middle, lower) Bollinger bands, or Nones if too few bars."""
    if period <= 0 or len(prices) < period:
        return None, None, None
    window = prices[-period:]
    mean = statistics.mean(window)
    sd = statistics.pstdev(window)
    return round(mean + mult * sd, 2), round(mean, 2), round(mean - mult * sd, 2)


def band_width(upper: float, middle: float, lower: float) -> float | None:
    """(upper-lower)/middle as a percent — low width flags a squeeze."""
    if not middle:
        return None
    return round((upper - lower) / middle * 100, 2)


def percent_b(price: float, upper: float | None, lower: float | None) -> float | None:
    """Position of price within the bands: 0 = lower band, 1 = upper band."""
    if upper is None or lower is None or upper == lower:
        return None
    return round((price - lower) / (upper - lower), 3)


def week_52_range(highs: list[float], lows: list[float]) -> tuple[float | None, float | None]:
    """52-week (≈250 trading days) high and low from the tail of the series."""
    h = [v for v in highs[-250:] if v is not None]
    lo = [v for v in lows[-250:] if v is not None]
    if not h or not lo:
        return None, None
    return round(max(h), 2), round(min(lo), 2)


def position_in_range(price: float, high: float | None, low: float | None) -> float | None:
    """Where price sits in the 52w range as a percent (0 = at low, 100 = at high)."""
    if high is None or low is None or high == low:
        return None
    return round((price - low) / (high - low) * 100, 1)


def sma(prices: list[float], period: int) -> float | None:
    """Simple moving average of the last ``period`` closes."""
    if period <= 0 or len(prices) < period:
        return None
    return round(sum(prices[-period:]) / period, 2)


def rsi(prices: list[float], period: int = 14) -> float | None:
    """Wilder's RSI (0-100) over the last ``period`` bars, or None if too few.

    Descriptive momentum gauge — not a trade signal.
    """
    if period <= 0 or len(prices) < period + 1:
        return None
    gains = 0.0
    losses = 0.0
    # Seed with the first `period` deltas.
    for i in range(1, period + 1):
        delta = prices[i] - prices[i - 1]
        gains += max(delta, 0.0)
        losses += max(-delta, 0.0)
    avg_gain = gains / period
    avg_loss = losses / period
    # Wilder smoothing across the rest.
    for i in range(period + 1, len(prices)):
        delta = prices[i] - prices[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(delta, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-delta, 0.0)) / period
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> float | None:
    """Average True Range over the last ``period`` bars (volatility, price units)."""
    n = min(len(highs), len(lows), len(closes))
    if n < period + 1:
        return None
    trs: list[float] = []
    for i in range(1, n):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    if len(trs) < period:
        return None
    return round(sum(trs[-period:]) / period, 2)
