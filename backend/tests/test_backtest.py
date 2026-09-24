"""Pure SMA-crossover backtest tests."""
from __future__ import annotations

from app.services.backtest import run_backtest


def test_insufficient_data() -> None:
    out = run_backtest([1, 2, 3], fast=20, slow=50)
    assert out["available"] is False


def test_bad_params() -> None:
    prices = [float(i) for i in range(100)]
    assert run_backtest(prices, fast=50, slow=20)["available"] is False  # slow<=fast


def test_uptrend_strategy_matches_shape() -> None:
    # A steady uptrend: fast SMA stays above slow → mostly invested, positive return.
    prices = [100 * (1.01 ** i) for i in range(120)]
    out = run_backtest(prices, fast=10, slow=30)
    assert out["available"] is True
    assert out["days"] == 120
    assert out["strategy_return"] > 0
    assert out["buyhold_return"] > 0
    assert 0.0 <= out["time_in_market"] <= 1.0
    assert len(out["equity"]) >= 2
    assert out["equity"][0]["s"] == 1.0 and out["equity"][0]["b"] == 1.0


def test_flat_then_up_takes_a_trade() -> None:
    prices = [100.0] * 60 + [100 * (1.02 ** i) for i in range(60)]
    out = run_backtest(prices, fast=10, slow=30)
    assert out["available"] is True
    assert out["trades"] >= 1
    assert out["win_rate"] is None or 0.0 <= out["win_rate"] <= 1.0


def test_downtrend_stays_mostly_flat() -> None:
    prices = [100 * (0.99 ** i) for i in range(120)]
    out = run_backtest(prices, fast=10, slow=30)
    # In a persistent downtrend the fast SMA sits below the slow one → little time invested.
    assert out["time_in_market"] < 0.5
    # Staying flat should lose less than buy-and-hold's decline.
    assert out["strategy_return"] > out["buyhold_return"]
