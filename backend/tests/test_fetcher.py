"""Unit tests for TCBS response mapping (no network)."""
from __future__ import annotations

from app.services.providers.tcbs import (
    _yoy,
    map_financial_ratio,
    map_listing,
)

LISTING_SAMPLE = [
    {"ticker": "fpt", "organShortName": "CTCP FPT", "exchange": "hose", "icbName": "CNTT"},
    {"ticker": "VCB", "companyName": "Vietcombank", "comGroupCode": "HOSE"},
    {"ticker": "", "organShortName": "junk"},  # dropped: empty symbol
]

RATIO_SAMPLE = [
    {  # latest: Q1 2024
        "ticker": "FPT", "year": 2024, "quarter": 1,
        "priceToEarning": 18.5, "priceToBook": 4.2,
        "roe": 0.285, "roa": 0.126, "postTaxMargin": 0.164,
        "grossProfitMargin": 0.38, "debtOnEquity": 0.6,
        "earningPerShare": 6842, "revenue": 14000, "postTaxProfit": 2680,
    },
    {  # prior year same quarter for YoY
        "ticker": "FPT", "year": 2023, "quarter": 1,
        "priceToEarning": 16.0, "roe": 0.26,
        "earningPerShare": 5710, "revenue": 11570, "postTaxProfit": 2237,
    },
]


def test_map_listing_normalizes_and_filters() -> None:
    out = map_listing(LISTING_SAMPLE)
    assert [s.symbol for s in out] == ["FPT", "VCB"]  # empty dropped, upcased
    fpt = out[0]
    assert fpt.company_name == "CTCP FPT"
    assert fpt.exchange == "HOSE"
    assert fpt.industry == "CNTT"


def test_map_listing_accepts_envelope() -> None:
    assert len(map_listing({"data": LISTING_SAMPLE})) == 2


def test_map_financial_ratio_latest_and_percent_scaling() -> None:
    m = map_financial_ratio(RATIO_SAMPLE, "FPT")
    assert m.symbol == "FPT"
    assert m.pe == 18.5
    assert m.pb == 4.2
    assert m.roe == 28.5  # 0.285 → percent
    assert m.roa == 12.6
    assert m.net_margin == 16.4
    assert m.period == "quarterly"
    # report_date derived from year/quarter
    assert m.report_date is not None and m.report_date.year == 2024


def test_map_financial_ratio_yoy_growth() -> None:
    m = map_financial_ratio(RATIO_SAMPLE, "FPT")
    # EPS YoY: (6842-5710)/5710 ≈ 19.8%
    assert m.eps_growth is not None and 19 < m.eps_growth < 21
    assert m.revenue_growth is not None and 20 < m.revenue_growth < 22


def test_map_financial_ratio_empty() -> None:
    m = map_financial_ratio([], "XYZ")
    assert m.symbol == "XYZ" and m.pe is None


def test_yoy_guards_zero_and_none() -> None:
    assert _yoy(10, 0) is None
    assert _yoy(None, 5) is None
    assert _yoy(110, 100) == 10.0
