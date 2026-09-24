"""Pure factor-ranking tests."""
from __future__ import annotations

from app.services.factors import _percentiles, compute_factors


def test_percentiles_higher_better() -> None:
    # [10, 30, 20] → 10 lowest (0), 30 highest (100), 20 middle (50).
    assert _percentiles([10, 30, 20], higher_better=True) == [0.0, 100.0, 50.0]


def test_percentiles_lower_better_inverts() -> None:
    assert _percentiles([10, 30, 20], higher_better=False) == [100.0, 0.0, 50.0]


def test_percentiles_ties_share_average_rank() -> None:
    # Three zeros + a 5: the zeros are ranks 0,1,2 (avg 1) → 1/3*100 ≈ 33.3 each,
    # and all three must get the SAME score (not spread across the range).
    p = _percentiles([0, 0, 5, 0], higher_better=True)
    assert p[0] == p[1] == p[3]
    assert p[2] == 100.0  # the distinct top value


def test_percentiles_skip_none_and_too_few() -> None:
    assert _percentiles([None, 5], higher_better=True) == [None, None]  # <2 comparable
    p = _percentiles([1, None, 3, 5], higher_better=True)
    assert p[1] is None and p[0] == 0.0 and p[3] == 100.0


def _r(sym: str, **m: float) -> dict:
    base = {"symbol": sym, "company_name": f"{sym} Co", "industry": "X"}
    base.update(m)
    return base


def test_compute_factors_ranks_and_composite() -> None:
    rows = [
        _r("A", pe=8, pb=1.0, dividend_yield=6, roe=25, roa=12, net_margin=20, debt_equity=0.3,
           revenue_growth=20, eps_growth=25),   # cheap + high quality + growth → top
        _r("B", pe=30, pb=4.0, dividend_yield=0, roe=8, roa=3, net_margin=5, debt_equity=2.0,
           revenue_growth=-5, eps_growth=-10),  # expensive + weak → bottom
        _r("C", pe=15, pb=2.0, dividend_yield=3, roe=15, roa=7, net_margin=12, debt_equity=1.0,
           revenue_growth=8, eps_growth=6),
    ]
    out = compute_factors(rows)
    assert [s["symbol"] for s in out][0] == "A"    # best composite first
    assert [s["symbol"] for s in out][-1] == "B"   # worst last
    a = next(s for s in out if s["symbol"] == "A")
    assert a["value"] == 100.0 and a["quality"] == 100.0 and a["growth"] == 100.0
    assert a["composite"] == 100.0


def test_compute_factors_handles_missing_metrics() -> None:
    rows = [_r("A", pe=10), _r("B", pe=20)]  # only pe present
    out = compute_factors(rows)
    a = next(s for s in out if s["symbol"] == "A")
    assert a["value"] is not None       # from pe percentile
    assert a["quality"] is None and a["growth"] is None
    assert a["composite"] == a["value"]  # only value contributes
