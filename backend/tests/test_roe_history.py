"""Unit tests for the pure ROE-history analytics."""
from __future__ import annotations

from app.services.roe_history import roe_explanation, roe_stats


def _hist(pairs: list[tuple[int, float | None]]) -> list[dict]:
    return [{"year": y, "roe": r} for y, r in pairs]


def test_roe_stats_unavailable_when_no_points() -> None:
    assert roe_stats([]) == {"available": False, "series": []}
    assert roe_stats(_hist([(2022, None), (2023, None)]))["available"] is False


def test_roe_stats_rising_high_quality() -> None:
    # FPT-like: steady, high, rising ROE.
    stats = roe_stats(_hist([(2021, 21.7), (2022, 27.2), (2023, 28.1), (2024, 28.7)]))
    assert stats["available"] is True
    assert stats["latest"] == 28.7
    assert stats["trend"] == "rising"
    assert stats["positive_years"] == 4
    assert stats["is_spike"] is False  # steady, not a one-off jump
    assert stats["quality_score"] >= 80  # high level + consistent + rising
    assert [p["year"] for p in stats["series"]] == [2021, 2022, 2023, 2024]


def test_roe_stats_detects_spike() -> None:
    # A one-off jump: latest far above the prior average.
    stats = roe_stats(_hist([(2021, 8.0), (2022, 9.0), (2023, 7.0), (2024, 30.0)]))
    assert stats["is_spike"] is True
    assert stats["spike_factor"] > 1.5
    assert any("bất thường" in line for line in roe_explanation(stats))


def test_roe_stats_falling_trend_scores_lower() -> None:
    falling = roe_stats(_hist([(2021, 25.0), (2022, 20.0), (2023, 15.0), (2024, 10.0)]))
    rising = roe_stats(_hist([(2021, 10.0), (2022, 15.0), (2023, 20.0), (2024, 25.0)]))
    assert falling["trend"] == "falling"
    assert rising["trend"] == "rising"
    assert falling["quality_score"] < rising["quality_score"]


def test_roe_stats_ignores_null_roe_years() -> None:
    stats = roe_stats(_hist([(2022, None), (2023, 18.0), (2024, 20.0)]))
    assert stats["n"] == 2
    assert stats["latest"] == 20.0


def test_roe_explanation_unavailable() -> None:
    assert roe_explanation({"available": False, "series": []}) == [
        "Chưa có chuỗi ROE nhiều năm để đánh giá."
    ]
