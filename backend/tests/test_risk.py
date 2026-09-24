"""Pure risk-math tests."""
from __future__ import annotations

import math

import pytest

from app.services import risk


def test_daily_returns() -> None:
    r = risk.daily_returns([100, 110, 99])
    assert r == pytest.approx([0.1, -0.1])
    # Length is preserved; a zero previous close yields a 0.0 return (kept, not dropped).
    assert risk.daily_returns([100, 0, 50]) == [-1.0, 0.0]


def test_annualized_volatility() -> None:
    # Constant returns → zero volatility.
    assert risk.annualized_volatility([0.01, 0.01, 0.01]) == 0.0
    assert risk.annualized_volatility([0.01]) is None


def test_sharpe_zero_vol_is_none() -> None:
    assert risk.sharpe_ratio([0.01, 0.01, 0.01]) is None


def test_sharpe_positive_for_positive_drift() -> None:
    s = risk.sharpe_ratio([0.01, 0.02, 0.00, 0.015, -0.005])
    assert s is not None and s > 0


def test_max_drawdown() -> None:
    # 100 → 120 → 60: peak 120, trough 60 → -50%.
    assert risk.max_drawdown([100, 120, 60, 90]) == -0.5
    assert risk.max_drawdown([100]) is None


def test_max_drawdown_monotonic_up_is_zero() -> None:
    assert risk.max_drawdown([10, 20, 30]) == 0.0


def test_historical_var_is_a_loss_quantile() -> None:
    returns = [-0.05, -0.03, -0.01, 0.0, 0.01, 0.02, 0.03, 0.04, 0.05, -0.10]
    var = risk.historical_var(returns, confidence=0.9)
    assert var is not None and var <= 0


def test_pearson_corr_perfect_and_inverse() -> None:
    assert risk.pearson_corr([1, 2, 3], [2, 4, 6]) == 1.0
    assert risk.pearson_corr([1, 2, 3], [3, 2, 1]) == -1.0


def test_pearson_corr_flat_is_none() -> None:
    assert risk.pearson_corr([1, 1, 1], [1, 2, 3]) is None


def test_correlation_matrix_upper_triangle() -> None:
    m = risk.correlation_matrix({"A": [1, 2, 3], "B": [2, 4, 6], "C": [3, 2, 1]})
    pairs = {(d["a"], d["b"]) for d in m}
    assert pairs == {("A", "B"), ("A", "C"), ("B", "C")}
    ab = next(d for d in m if d["a"] == "A" and d["b"] == "B")
    assert math.isclose(ab["corr"], 1.0)
