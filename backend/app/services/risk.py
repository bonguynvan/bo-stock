"""Portfolio risk math — pure, DB-free, unit-tested (research-only, descriptive).

Standard risk statistics over a return series: annualized volatility, Sharpe (rf=0
by default), max drawdown, historical VaR, and pairwise correlation. No advice — just
the numbers. The service layer assembles the series from holdings' price history.
"""
from __future__ import annotations

import math
import statistics

_TRADING_DAYS = 252


def daily_returns(prices: list[float]) -> list[float]:
    """Simple daily returns from an aligned close series.

    Always length ``len(prices) - 1`` (a zero previous close yields a 0.0 return, not a
    dropped element) so aligned multi-series math stays index-consistent.
    """
    out: list[float] = []
    for i in range(1, len(prices)):
        prev = prices[i - 1]
        out.append(prices[i] / prev - 1.0 if prev else 0.0)
    return out


def annualized_volatility(returns: list[float], periods: int = _TRADING_DAYS) -> float | None:
    if len(returns) < 2:
        return None
    return round(statistics.pstdev(returns) * math.sqrt(periods), 4)


def sharpe_ratio(
    returns: list[float], rf_daily: float = 0.0, periods: int = _TRADING_DAYS
) -> float | None:
    """Annualized Sharpe. rf_daily is the per-day risk-free rate (default 0)."""
    if len(returns) < 2:
        return None
    sd = statistics.pstdev(returns)
    if sd == 0:
        return None
    excess = statistics.mean(returns) - rf_daily
    return round(excess / sd * math.sqrt(periods), 3)


def max_drawdown(prices: list[float]) -> float | None:
    """Largest peak-to-trough decline as a negative fraction (e.g. -0.23 = -23%)."""
    if len(prices) < 2:
        return None
    peak = prices[0]
    worst = 0.0
    for p in prices:
        if p > peak:
            peak = p
        if peak:
            dd = p / peak - 1.0
            if dd < worst:
                worst = dd
    return round(worst, 4)


def historical_var(returns: list[float], confidence: float = 0.95) -> float | None:
    """Historical 1-day VaR at ``confidence`` as a negative fraction (loss)."""
    if len(returns) < 2:
        return None
    ordered = sorted(returns)
    idx = int((1.0 - confidence) * len(ordered))
    idx = min(max(idx, 0), len(ordered) - 1)
    return round(ordered[idx], 4)


def pearson_corr(a: list[float], b: list[float]) -> float | None:
    """Pearson correlation over the aligned prefix of two return series."""
    n = min(len(a), len(b))
    if n < 2:
        return None
    x, y = a[:n], b[:n]
    sdx = statistics.pstdev(x)
    sdy = statistics.pstdev(y)
    if sdx == 0 or sdy == 0:
        return None
    mx, my = statistics.mean(x), statistics.mean(y)
    cov = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y)) / n
    return round(cov / (sdx * sdy), 3)


def correlation_matrix(series: dict[str, list[float]]) -> list[dict]:
    """Pairwise correlations for a {symbol: returns} map (upper triangle)."""
    syms = list(series.keys())
    out: list[dict] = []
    for i in range(len(syms)):
        for j in range(i + 1, len(syms)):
            out.append(
                {"a": syms[i], "b": syms[j], "corr": pearson_corr(series[syms[i]], series[syms[j]])}
            )
    return out
