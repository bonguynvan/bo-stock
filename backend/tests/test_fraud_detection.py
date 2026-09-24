"""Unit tests for the fraud/strength models — pure math, synthetic inputs."""
from __future__ import annotations

from app.services.fraud_detection import (
    calculate_altman,
    calculate_altman_emerging,
    calculate_beneish,
    calculate_piotroski,
)

# A period with every Beneish raw field present.
FULL = {
    "revenue": 100.0, "receivables": 20.0, "gross_margin": 30.0,
    "current_assets": 40.0, "ppe": 30.0, "securities": 10.0, "total_assets": 100.0,
    "depreciation": 5.0, "sga": 10.0, "current_liabilities": 25.0,
    "long_term_debt": 15.0, "net_income": 12.0, "operating_cashflow": 12.0,
}


def test_beneish_clean_baseline_uses_all_8() -> None:
    # cur == prior → every index = 1.0, and NI == OCF → TATA = 0.
    r = calculate_beneish(FULL, FULL)
    assert r.variables_used == 8
    # -4.84 + (0.92+0.528+0.404+0.892+0.115-0.172-0.327) + 4.679*0 = -2.48
    assert abs(r.score - (-2.48)) < 0.01
    assert r.flag == "low_risk"


def test_beneish_high_tata_flags_high_risk() -> None:
    # Accounting profit far above cash (NI 40, OCF 10) → TATA = 0.30.
    cur = {**FULL, "net_income": 40.0, "operating_cashflow": 10.0}
    r = calculate_beneish(cur, FULL)
    assert r.variables["TATA"] == 0.30
    # baseline -2.48 + 4.679*0.30 ≈ -1.08 → above the -1.78 threshold
    assert r.score > -1.78 and r.flag == "high_risk"


def test_beneish_missing_fields_reduce_variables_used() -> None:
    thin = {"revenue": 100.0, "gross_margin": 30.0, "net_income": 12.0,
            "operating_cashflow": 6.0, "total_assets": 100.0}
    r = calculate_beneish(thin, {"revenue": 90.0, "gross_margin": 30.0})
    assert r.variables_used == 3  # GMI, SGI, TATA only
    assert r.variables["DSRI"] is None and r.variables["AQI"] is None  # not fabricated


def test_altman_zones_and_financial_exclusion() -> None:
    p = {"working_capital": 20.0, "retained_earnings": 30.0, "ebit": 10.0,
         "total_assets": 100.0, "market_cap": 200.0, "total_liabilities": 100.0,
         "revenue": 100.0}
    r = calculate_altman(p)
    assert abs(r.score - 3.19) < 0.01 and r.zone == "safe"
    assert calculate_altman(p, sector="Ngân hàng").zone == "not_applicable"
    assert calculate_altman({"total_assets": 100.0}).zone == "insufficient_data"


def test_altman_emerging_uses_book_equity_no_sales_term() -> None:
    # WC/TA=.2, RE/TA=.3, EBIT/TA=.1, book equity 60 / TL 40 = 1.5
    p = {"working_capital": 20.0, "retained_earnings": 30.0, "ebit": 10.0,
         "total_assets": 100.0, "total_liabilities": 40.0}
    r = calculate_altman_emerging(p)
    # 3.25 + 6.56*.2 + 3.26*.3 + 6.72*.1 + 1.05*1.5 = 3.25+1.312+0.978+0.672+1.575 = 7.787
    assert abs(r.score - 7.787) < 0.01 and r.zone == "safe"  # no market_cap needed
    assert calculate_altman_emerging(p, sector="Chứng khoán").zone == "not_applicable"


def test_piotroski_counts_only_available_criteria() -> None:
    cur = {"roa": 12.0, "operating_cashflow": 50.0, "net_income": 30.0,
           "gross_margin": 30.0, "revenue": 120.0, "total_assets": 100.0}
    prior = {"roa": 8.0, "gross_margin": 25.0, "revenue": 100.0, "total_assets": 100.0}
    r = calculate_piotroski(cur, prior)
    # ROA>0, OCF>0, ROA↑, OCF>NI, gross↑, turnover↑ all pass; leverage/current/shares unknown
    assert r.score == 6 and r.max_score == 6
