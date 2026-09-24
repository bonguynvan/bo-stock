"""Pure tests for the investment lenses evaluation."""
from __future__ import annotations

from app.services.lenses import evaluate_lenses


def _by_key(result: list[dict]) -> dict[str, dict]:
    return {r["key"]: r for r in result}


def test_three_lenses_returned() -> None:
    res = _by_key(evaluate_lenses({}))
    assert set(res) == {"graham", "lynch", "quality"}


def test_empty_metrics_all_na_zero_total() -> None:
    for lens in evaluate_lenses({}):
        assert lens["total"] == 0 and lens["met"] == 0
        assert all(c["status"] == "na" for c in lens["criteria"])


def test_graham_value_stock_passes_most() -> None:
    m = {"pe": 10, "pb": 1.2, "debt_equity": 0.4, "current_ratio": 2.0, "dividend_yield": 3.0}
    g = _by_key(evaluate_lenses(m))["graham"]
    assert g["total"] == 6 and g["met"] == 6  # all six criteria evaluable and met
    labels = {c["label"]: c["status"] for c in g["criteria"]}
    assert labels["P/E × P/B ≤ 22.5 (Graham number)"] == "pass"  # 10*1.2=12


def test_graham_expensive_stock_fails() -> None:
    m = {"pe": 40, "pb": 6, "debt_equity": 2, "current_ratio": 0.8, "dividend_yield": 0}
    g = _by_key(evaluate_lenses(m))["graham"]
    assert g["met"] == 0 and g["total"] == 6


def test_lynch_peg_and_growth() -> None:
    # PE 12, eps growth 20% → PEG 0.6 (pass); growth positive (pass); ROE 18 (pass).
    m = {"pe": 12, "eps_growth": 20, "roe": 18, "debt_equity": 0.8}
    lynch = _by_key(evaluate_lenses(m))["lynch"]
    assert lynch["met"] == 4 and lynch["total"] == 4
    peg = next(c for c in lynch["criteria"] if c["label"] == "PEG ≤ 1")
    assert peg["status"] == "pass" and peg["detail"] == 0.6


def test_peg_na_when_growth_nonpositive() -> None:
    m = {"pe": 12, "eps_growth": -5}
    lynch = _by_key(evaluate_lenses(m))["lynch"]
    peg = next(c for c in lynch["criteria"] if c["label"] == "PEG ≤ 1")
    assert peg["status"] == "na"  # can't compute PEG on non-positive growth


def test_negative_pe_does_not_pass_peg_or_graham() -> None:
    # Loss-making: negative P/E must NOT pass PEG or the Graham number.
    m = {"pe": -8, "pb": 1.2, "eps_growth": 20}
    res = _by_key(evaluate_lenses(m))
    peg = next(c for c in res["lynch"]["criteria"] if c["label"] == "PEG ≤ 1")
    gnum = next(c for c in res["graham"]["criteria"] if c["label"].startswith("P/E × P/B"))
    assert peg["status"] == "na"
    assert gnum["status"] == "na"


def test_growth_falls_back_to_revenue_growth() -> None:
    m = {"revenue_growth": 8}  # no eps_growth
    lynch = _by_key(evaluate_lenses(m))["lynch"]
    grow = next(c for c in lynch["criteria"] if c["label"] == "Tăng trưởng dương")
    assert grow["status"] == "pass" and grow["detail"] == 8.0
