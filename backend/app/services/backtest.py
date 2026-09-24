"""SMA-crossover backtest over a symbol's price history (research-only).

A HYPOTHETICAL historical study of a simple technical rule (hold while SMA(fast) >
SMA(slow), otherwise flat), compared to buy-and-hold. It is a research aid for
understanding a rule's past behaviour — NOT a trade signal, NOT advice, and past
results do not predict the future. Pure ``run_backtest`` is unit-tested.
"""
from __future__ import annotations

from app.services import risk


def _sma_at(closes: list[float], i: int, period: int) -> float | None:
    if i + 1 < period:
        return None
    return sum(closes[i - period + 1 : i + 1]) / period


def _ret(closes: list[float], i: int) -> float:
    prev = closes[i - 1]
    return closes[i] / prev - 1.0 if prev else 0.0


def _downsample(eq_s: list[float], eq_b: list[float], cap: int = 120) -> list[dict]:
    n = len(eq_s)
    step = max(1, n // cap)
    pts = [{"i": i, "s": round(eq_s[i], 4), "b": round(eq_b[i], 4)} for i in range(0, n, step)]
    if pts and pts[-1]["i"] != n - 1:
        pts.append({"i": n - 1, "s": round(eq_s[-1], 4), "b": round(eq_b[-1], 4)})
    return pts


def run_backtest(closes: list[float], fast: int = 20, slow: int = 50) -> dict:
    """Simulate the SMA(fast)/SMA(slow) rule vs buy-and-hold on a close series."""
    n = len(closes)
    if fast < 1 or slow <= fast or n < slow + 2:
        return {"available": False, "note": "Không đủ dữ liệu giá cho tham số này."}

    smaf = [_sma_at(closes, i, fast) for i in range(n)]
    smas = [_sma_at(closes, i, slow) for i in range(n)]

    # position for day i's return is decided by the previous day's crossover.
    positions: list[int] = []
    strat_returns: list[float] = []
    bh_returns: list[float] = []
    for i in range(1, n):
        sf, ss = smaf[i - 1], smas[i - 1]
        pos = 1 if (sf is not None and ss is not None and sf > ss) else 0
        positions.append(pos)
        r = _ret(closes, i)
        strat_returns.append(pos * r)
        bh_returns.append(r)

    eq_s = [1.0]
    eq_b = [1.0]
    for k in range(len(strat_returns)):
        eq_s.append(eq_s[-1] * (1 + strat_returns[k]))
        eq_b.append(eq_b[-1] * (1 + bh_returns[k]))

    # Per-trade (contiguous holding run) returns → count + win rate.
    trades = wins = 0
    i = 0
    while i < len(positions):
        if positions[i] == 1:
            j, prod = i, 1.0
            while j < len(positions) and positions[j] == 1:
                prod *= 1 + strat_returns[j]
                j += 1
            trades += 1
            if prod > 1:
                wins += 1
            i = j
        else:
            i += 1

    return {
        "available": True,
        "days": n,
        "fast": fast,
        "slow": slow,
        "strategy_return": round((eq_s[-1] - 1) * 100, 2),
        "buyhold_return": round((eq_b[-1] - 1) * 100, 2),
        "strategy": {
            "annual_volatility": risk.annualized_volatility(strat_returns),
            "sharpe": risk.sharpe_ratio(strat_returns),
            "max_drawdown": risk.max_drawdown(eq_s),
        },
        "buyhold": {
            "annual_volatility": risk.annualized_volatility(bh_returns),
            "sharpe": risk.sharpe_ratio(bh_returns),
            "max_drawdown": risk.max_drawdown(eq_b),
        },
        "trades": trades,
        "win_rate": round(wins / trades, 3) if trades else None,
        "time_in_market": round(sum(positions) / len(positions), 3),
        "equity": _downsample(eq_s, eq_b),
    }
