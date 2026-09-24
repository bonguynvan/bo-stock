"""Unit tests for the pure index parser + analytics helpers."""
from __future__ import annotations

from datetime import date

from app.services.analytics import (
    _concentration,
    _income_quality,
    _pnl_by_sector,
    _sector_vs_market,
    _wavg,
)
from app.services.index_data import _ret, parse_index_bars

# Real KBS shape: newest-first, mixed str/number values.
KBS = {
    "symbol": "VNINDEX",
    "data_day": [
        {"t": "2026-07-01 07:00", "o": "1860.90", "h": "1871.68", "l": "1859.68", "c": "1867.21", "v": "615059624.0"},
        {"t": "2026-06-30 07:00", "o": 1855.67, "h": 1863.14, "l": 1844.66, "c": 1860.01, "v": 505116145},
        {"t": "bad-date", "c": "1"},  # dropped
    ],
}


def test_parse_index_bars_sorts_and_coerces() -> None:
    bars = parse_index_bars(KBS)
    assert len(bars) == 2  # bad-date dropped
    assert bars[0]["date"] == date(2026, 6, 30) and bars[1]["date"] == date(2026, 7, 1)
    assert bars[1]["close"] == 1867.21  # string coerced
    assert bars[0]["close"] == 1860.01  # number kept
    assert bars[1]["volume"] == 615059624


def test_parse_index_bars_empty() -> None:
    assert parse_index_bars({}) == []
    assert parse_index_bars({"data_day": "nope"}) == []


def test_ret_from_since_date() -> None:
    closes = [(date(2026, 1, 1), 100.0), (date(2026, 4, 1), 110.0), (date(2026, 7, 1), 121.0)]
    assert _ret(closes, date(2026, 1, 1)) == 21.0  # 100 -> 121
    assert _ret(closes, date(2026, 4, 1)) == 10.0  # 110 -> 121
    assert _ret([], date(2026, 1, 1)) is None


def test_concentration() -> None:
    c = _concentration([{"weight": 50.0}, {"weight": 30.0}, {"weight": 20.0}])
    assert c["top1"] == 50.0 and c["top3"] == 100.0 and c["positions"] == 3
    assert c["hhi"] == 50 * 50 + 30 * 30 + 20 * 20  # 3800 → concentrated


def test_wavg_value_weighted() -> None:
    # weights 800/200, values 10/30 → (800*10+200*30)/1000 = 14
    assert _wavg([(800, 10.0), (200, 30.0)]) == 14.0
    assert _wavg([(100, None), (0, 5.0)]) is None  # no usable weight/value


def test_income_quality_dividend_and_flags() -> None:
    priced = [
        {"symbol": "A", "market_value": 600, "weight": 60.0, "dividend_yield": 5.0, "pe": 10.0, "roe": 20.0, "cost_basis": 500, "pnl": 100, "compass": {"long": 80}},
        {"symbol": "B", "market_value": 400, "weight": 40.0, "dividend_yield": 0.0, "pe": 20.0, "roe": 10.0, "cost_basis": 450, "pnl": -50, "compass": {"long": 50}},
    ]
    iq = _income_quality(priced, total_value=1000, sector_alloc=[{"label": "Bank", "pct": 60.0}])
    assert iq["expected_annual_dividend"] == 30  # 5% of 600
    assert iq["portfolio_yield_pct"] == 3.0
    assert iq["wavg_pe"] == 14.0  # (600*10+400*20)/1000
    assert iq["solid_count"] == 1  # only A has long>=65
    # A is 60% (>25) and Bank sector is 60% (>40) → two flags
    assert any("A chiếm" in f for f in iq["risk_flags"])
    assert any("Bank" in f for f in iq["risk_flags"])


def test_pnl_by_sector_groups_and_sorts() -> None:
    priced = [
        {"industry": "Bank", "pnl": 100, "cost_basis": 500},
        {"industry": "Bank", "pnl": 50, "cost_basis": 500},
        {"industry": "Tech", "pnl": -30, "cost_basis": 300},
        {"industry": "Tech", "pnl": None, "cost_basis": 100},  # skipped
    ]
    out = _pnl_by_sector(priced)
    assert [s["label"] for s in out] == ["Bank", "Tech"]
    assert out[0]["pnl"] == 150 and out[0]["pnl_pct"] == 15.0  # 150/1000
    assert out[1]["pnl"] == -30


def test_sector_vs_market_over_underweight() -> None:
    port = [{"label": "Ngân hàng", "pct": 60.0}, {"label": "Bán lẻ", "pct": 40.0}]
    sectors_ov = {"sectors": [
        {"industry": "Ngân hàng", "total_market_cap": 3000},
        {"industry": "Bán lẻ", "total_market_cap": 1000},
    ]}
    out = _sector_vs_market(port, sectors_ov)
    bank = next(s for s in out if s["label"] == "Ngân hàng")
    assert bank["market_pct"] == 75.0 and bank["portfolio_pct"] == 60.0
    assert bank["diff"] == -15.0  # underweight banks vs market
