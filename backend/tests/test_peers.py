"""Unit + DB tests for peer/industry comparison."""
from __future__ import annotations

from app.services.peers import get_peer_comparison, metric_stats


def test_metric_stats_distribution_and_percentile() -> None:
    vals = [10.0, 20.0, 30.0, 40.0, 50.0]
    s = metric_stats(vals, target=40.0)
    assert s["n"] == 5
    assert s["median"] == 30.0
    assert s["min"] == 10.0 and s["max"] == 50.0
    # 3 of 5 peers are strictly below 40 → 60th percentile
    assert s["percentile"] == 60


def test_metric_stats_handles_nulls_and_empty() -> None:
    s = metric_stats([None, 5.0, None, 15.0], target=None)
    assert s["n"] == 2 and s["median"] == 10.0 and s["percentile"] is None
    empty = metric_stats([None, None], target=3.0)
    assert empty == {"n": 0, "median": None, "p25": None, "p75": None,
                     "min": None, "max": None, "percentile": None}


async def test_get_peer_comparison_against_seeded_industry(session) -> None:
    # conftest seeds AAA..FFF; check the same-industry comparison shape.
    out = await get_peer_comparison(session, "AAA")
    assert "error" not in out
    assert out["peer_count"] >= 1
    roe = next(m for m in out["metrics"] if m["key"] == "roe")
    assert roe["label"] == "ROE %" and roe["higher_is_better"] is True
    assert "median" in roe and "percentile" in roe


async def test_get_peer_comparison_unknown_symbol(session) -> None:
    out = await get_peer_comparison(session, "ZZZ")
    assert "error" in out
