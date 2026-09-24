"""Pure Quality-of-Earnings tests."""
from __future__ import annotations

from app.services.earnings_quality import calculate_earnings_quality


def _period(**kw: float) -> dict:
    return kw


def test_high_quality_cash_backed_earnings() -> None:
    # Profit fully cash-backed, receivables in line with sales, margin rising.
    cur = _period(net_income=100, operating_cashflow=130, total_assets=1000,
                  revenue=1200, receivables=110, gross_margin=0.25)
    prior = _period(total_assets=1000, revenue=1000, receivables=100, gross_margin=0.24)
    r = calculate_earnings_quality(cur, prior)
    assert r.components_used == 4
    assert r.flag == "strong"
    assert r.score is not None and r.score >= 85
    # accruals ratio = (100-130)/1000 = -0.03 → sub 95
    assert r.components["accruals"]["value"] == -0.03
    assert r.components["accruals"]["sub_score"] == 95.0


def test_low_quality_accrual_driven_earnings() -> None:
    # Profit far above cash, receivables ballooning vs sales, margin falling.
    cur = _period(net_income=200, operating_cashflow=20, total_assets=1000,
                  revenue=1100, receivables=200, gross_margin=0.18)
    prior = _period(total_assets=1000, revenue=1000, receivables=100, gross_margin=0.25)
    r = calculate_earnings_quality(cur, prior)
    assert r.flag == "weak"
    assert r.score is not None and r.score < 20
    assert r.components["accruals"]["sub_score"] == 0.0  # ratio 0.18 clamps to 0
    assert r.components["receivables"]["sub_score"] == 0.0  # receivables doubled vs +10% sales


def test_cash_conversion_skipped_when_net_income_not_positive() -> None:
    cur = _period(net_income=-50, operating_cashflow=30, total_assets=1000,
                  revenue=1000, receivables=100, gross_margin=0.2)
    prior = _period(total_assets=1000, revenue=1000, receivables=100, gross_margin=0.2)
    r = calculate_earnings_quality(cur, prior)
    assert "cash_conversion" not in r.components  # NI ≤ 0 → meaningless, dropped
    assert "accruals" in r.components


def test_insufficient_data_returns_none() -> None:
    cur = _period(net_income=100)  # nothing else → 0 usable components
    prior = _period()
    r = calculate_earnings_quality(cur, prior)
    assert r.score is None
    assert r.flag == "insufficient_data"
    assert r.components_used == 0
