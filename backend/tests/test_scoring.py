"""Unit tests for the quant scoring + grade mapping (pure functions)."""
from __future__ import annotations

from app.services.scoring import (
    MetricInputs,
    compute_quant_score,
    score_to_grade,
)


def test_strong_fundamentals_score_high() -> None:
    score = compute_quant_score(
        MetricInputs(roe=28, roa=13, net_margin=20, revenue_growth=25,
                     eps_growth=20, pe=12, pb=2.0, debt_equity=0.3)
    )
    assert score >= 70
    assert score_to_grade(score) in {"B++", "A+", "A++"}


def test_weak_fundamentals_score_low() -> None:
    score = compute_quant_score(
        MetricInputs(roe=2, roa=1, net_margin=1, revenue_growth=-8,
                     eps_growth=-10, pe=40, pb=6, debt_equity=2.5)
    )
    assert score < 40
    assert score_to_grade(score) in {"C", "C+"}


def test_partial_inputs_use_available_weights() -> None:
    # Only ROE present → should still return a sensible mid/high score.
    score = compute_quant_score(MetricInputs(roe=30))
    assert 90 <= score <= 100


def test_all_none_is_zero() -> None:
    assert compute_quant_score(MetricInputs()) == 0.0


def test_negative_pe_scores_zero_component() -> None:
    # Loss-making (pe<=0) should not be rewarded.
    loss = compute_quant_score(MetricInputs(pe=-5, roe=10))
    profit = compute_quant_score(MetricInputs(pe=10, roe=10))
    assert profit > loss


def test_grade_bands() -> None:
    assert score_to_grade(95) == "A++"
    assert score_to_grade(85) == "A+"
    assert score_to_grade(72) == "B++"
    assert score_to_grade(61) == "B"
    assert score_to_grade(50) == "C+"
    assert score_to_grade(10) == "C"
    assert score_to_grade(None) is None
