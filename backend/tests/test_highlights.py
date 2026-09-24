"""Unit tests for the pure fundamental-picks scoring."""
from __future__ import annotations

from app.services.highlights import BALANCED, evaluate
from app.services.roe_history import roe_stats
from app.services.dividends import dividend_stats


def _solid_metric() -> dict:
    return {"roe": 22.0, "pe": 12.0, "net_margin": 15.0, "debt_equity": 0.4, "market_cap": 5000}


def _solid_history() -> list[dict]:
    return [
        {"year": y, "roe": r, "dividend_yield": 2.0}
        for y, r in [(2021, 20.0), (2022, 21.0), (2023, 22.5), (2024, 22.0)]
    ]


def test_solid_stock_qualifies_with_reasons() -> None:
    hist = _solid_history()
    res = evaluate(_solid_metric(), roe_stats(hist), dividend_stats(hist), BALANCED)
    assert res is not None
    assert res["fundamental_score"] > 60
    assert any("ROE" in r for r in res["reasons"])
    assert any("cổ tức" in r.lower() for r in res["reasons"])


def test_high_leverage_rejected() -> None:
    m = _solid_metric() | {"debt_equity": 1.5}
    hist = _solid_history()
    assert evaluate(m, roe_stats(hist), dividend_stats(hist), BALANCED) is None


def test_expensive_pe_rejected() -> None:
    m = _solid_metric() | {"pe": 35.0}
    hist = _solid_history()
    assert evaluate(m, roe_stats(hist), dividend_stats(hist), BALANCED) is None


def test_inconsistent_roe_rejected() -> None:
    # A loss year breaks the "positive every year" consistency gate.
    hist = [
        {"year": 2021, "roe": 20.0, "dividend_yield": 2.0},
        {"year": 2022, "roe": -5.0, "dividend_yield": 0.0},
        {"year": 2023, "roe": 22.0, "dividend_yield": 2.0},
        {"year": 2024, "roe": 22.0, "dividend_yield": 2.0},
    ]
    assert evaluate(_solid_metric(), roe_stats(hist), dividend_stats(hist), BALANCED) is None


def test_too_little_history_rejected() -> None:
    hist = [{"year": 2024, "roe": 22.0, "dividend_yield": 2.0}]  # only 1 year
    assert evaluate(_solid_metric(), roe_stats(hist), dividend_stats(hist), BALANCED) is None


def test_low_roe_rejected() -> None:
    m = _solid_metric() | {"roe": 8.0}
    hist = _solid_history()
    assert evaluate(m, roe_stats(hist), dividend_stats(hist), BALANCED) is None


def test_non_dividend_payer_still_qualifies() -> None:
    hist = [
        {"year": y, "roe": r, "dividend_yield": 0.0}
        for y, r in [(2021, 20.0), (2022, 21.0), (2023, 22.5), (2024, 22.0)]
    ]
    res = evaluate(_solid_metric(), roe_stats(hist), dividend_stats(hist), BALANCED)
    assert res is not None  # dividends are a bonus, not a gate
    assert not any("cổ tức" in r.lower() for r in res["reasons"])
