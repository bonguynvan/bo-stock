"""Unit tests for the pure dividend-consistency analytics."""
from __future__ import annotations

from app.services.dividends import dividend_explanation, dividend_stats


def _hist(pairs: list[tuple[int, float | None]]) -> list[dict]:
    return [{"year": y, "dividend_yield": d} for y, d in pairs]


def test_unavailable_when_no_yield_data() -> None:
    assert dividend_stats([]) == {"available": False, "series": []}
    assert dividend_stats(_hist([(2023, None), (2024, None)]))["available"] is False


def test_consistent_payer_scores_high() -> None:
    stats = dividend_stats(_hist([(2021, 2.1), (2022, 2.6), (2023, 1.3), (2024, 2.9)]))
    assert stats["available"] is True
    assert stats["years_paid"] == 4
    assert stats["pay_ratio"] == 1.0
    assert stats["recent_streak"] == 4
    assert stats["score"] >= 80
    assert any("Trả cổ tức 4/4" in e for e in dividend_explanation(stats))


def test_non_payer_scores_zero_with_neutral_framing() -> None:
    stats = dividend_stats(_hist([(2022, 0.0), (2023, 0.0), (2024, 0.0)]))
    assert stats["years_paid"] == 0
    assert stats["score"] == 0.0
    assert any("tái đầu tư" in e for e in dividend_explanation(stats))


def test_erratic_payer_scores_below_consistent() -> None:
    erratic = dividend_stats(_hist([(2021, 3.0), (2022, 0.0), (2023, 0.0), (2024, 2.0)]))
    consistent = dividend_stats(_hist([(2021, 2.0), (2022, 2.0), (2023, 2.0), (2024, 2.0)]))
    # both paid recently, but the erratic one skipped years → lower pay_ratio
    assert erratic["pay_ratio"] < consistent["pay_ratio"]
    assert erratic["score"] < consistent["score"]


def test_recent_streak_counts_only_trailing_years() -> None:
    stats = dividend_stats(_hist([(2021, 2.0), (2022, 0.0), (2023, 1.5), (2024, 1.8)]))
    assert stats["recent_streak"] == 2  # 2023, 2024 (2022 breaks it)
    assert stats["years_paid"] == 3
