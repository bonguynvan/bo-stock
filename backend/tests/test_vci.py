"""Unit tests for VCI listing + ratio parsing and the resilient fallback chain."""
from __future__ import annotations

import pytest

from app.services.providers.base import FetchedMetrics, FetchedStock
from app.services.providers.resilient import ResilientProvider
from app.services.providers.vci import (
    map_vci_listing,
    parse_vci_balance_sheet,
    parse_vci_details,
    parse_vci_income,
    parse_vci_ohlc,
    parse_vci_ohlc_series,
    parse_vci_ownership,
    parse_vci_ratio,
    parse_vci_ratio_history,
    pick_profit_field,
)

# Real VCI getAll shape: board "HSX" == HOSE; type filters non-stocks.
LISTING_SAMPLE = [
    {"symbol": "fpt", "board": "HSX", "type": "STOCK",
     "organShortName": "CTCP FPT", "organName": "Cong ty FPT", "icbCode2": "9000"},
    {"symbol": "VCB", "board": "HSX", "type": "STOCK", "organName": "Vietcombank"},
    {"symbol": "YTC", "board": "UPCOM", "type": "STOCK", "organShortName": "XNK Y tế"},
    {"symbol": "E1VFVN30", "board": "HSX", "type": "ETF", "organName": "ETF"},  # dropped
    {"symbol": "", "board": "HNX", "type": "STOCK"},  # dropped: empty
]

# Real VCI statistics-financial shape: wide rows, ratioType TTM/YEAR, fraction %.
RATIO_SAMPLE = {
    "data": [
        {"ratioType": "RATIO_TTM", "yearReport": 2026, "year": "2026", "quarter": 1,
         "pe": 18.96, "pb": 4.2, "roe": 0.285, "roa": 0.126,
         "afterTaxProfitMargin": 0.164, "grossMargin": 0.38, "currentRatio": 1.3,
         "debtToEquity": 0.6, "dividendYield": 0.031, "evToEbitda": 6.8,
         "marketCap": 154230000000000.0},
        {"ratioType": "RATIO_TTM", "yearReport": 2025, "year": "2025", "quarter": 4,
         "pe": 27.26, "pb": 3.9, "roe": 0.26, "marketCap": 140000000000000.0},
        {"ratioType": "RATIO_YEAR", "yearReport": 2025, "year": "2025", "quarter": 0,
         "pe": 25.0, "pb": 3.5, "roe": 0.24},
    ]
}


def test_map_vci_listing_filters_and_maps_board() -> None:
    out = map_vci_listing(LISTING_SAMPLE)
    assert [s.symbol for s in out] == ["FPT", "VCB", "YTC"]  # ETF + empty dropped
    assert out[0].company_name == "CTCP FPT"
    assert out[0].exchange == "HOSE"  # HSX → HOSE
    assert out[2].exchange == "UPCOM"


def test_parse_vci_ratio_picks_latest_ttm() -> None:
    m = parse_vci_ratio(RATIO_SAMPLE, "FPT")
    assert m.pe == 18.96  # 2026-Q1 TTM, not 2025-Q4 or the RATIO_YEAR row
    assert m.pb == 4.2
    assert m.debt_equity == 0.6
    assert m.current_ratio == 1.3
    assert m.market_cap == 154230  # 154.23e12 VND → tỷ VND
    assert m.report_date is not None and m.report_date.year == 2026
    assert m.period == "quarterly"


def test_parse_vci_ratio_scales_fraction_percents() -> None:
    m = parse_vci_ratio(RATIO_SAMPLE, "FPT")
    assert m.roe == 28.5  # 0.285 → percent
    assert m.roa == 12.6
    assert m.net_margin == 16.4
    assert m.dividend_yield == 3.1


def test_parse_vci_ratio_empty() -> None:
    assert parse_vci_ratio({"data": []}, "XYZ").pe is None
    # rows present but no valuation → treated as empty
    assert parse_vci_ratio({"data": [{"ratioType": "RATIO_TTM", "roe": 0.1}]}, "X").pe is None


# Multi-year yearly series (the records the snapshot parser discards).
RATIO_HISTORY_SAMPLE = {
    "data": [
        {"ratioType": "RATIO_TTM", "yearReport": 2026, "quarter": 1, "roe": 0.29},
        {"ratioType": "RATIO_YEAR", "yearReport": 2023, "quarter": 5, "roe": 0.281,
         "roa": 0.116, "afterTaxProfitMargin": 0.148, "grossMargin": 0.38,
         "pe": 29.9, "pb": 5.1, "dividendYield": 0.02},
        {"ratioType": "RATIO_YEAR", "yearReport": 2024, "quarter": 5, "roe": 0.287},
        {"ratioType": "RATIO_YEAR", "yearReport": 2022, "quarter": 5, "roe": 0.272},
    ]
}


def test_parse_vci_ratio_history_sorts_and_scales() -> None:
    hist = parse_vci_ratio_history(RATIO_HISTORY_SAMPLE, "FPT")
    assert [h["year"] for h in hist] == [2022, 2023, 2024]  # sorted, TTM excluded
    assert [h["roe"] for h in hist] == [27.2, 28.1, 28.7]  # fractions → percent
    row = hist[1]  # 2023 carries the full field set
    assert row["roa"] == 11.6 and row["net_margin"] == 14.8
    assert row["pe"] == 29.9 and row["dividend_yield"] == 2.0


def test_parse_vci_ratio_history_empty_and_no_year() -> None:
    assert parse_vci_ratio_history({"data": []}, "X") == []
    # RATIO_YEAR rows without a usable yearReport are skipped
    assert parse_vci_ratio_history(
        {"data": [{"ratioType": "RATIO_YEAR", "roe": 0.1}]}, "X"
    ) == []


# --- company/details enrichment ---------------------------------------------

DETAILS_SAMPLE = {
    "data": {
        "organCode": "FPT", "currentPrice": 70800.0, "marketCap": 120608304166800.0,
        "sectorVn": "Công nghệ Thông tin", "sector": "Technology",
        "viOrganShortName": "FPT Corp", "viOrganName": "Công ty Cổ phần FPT",
        # advisory fields that MUST NOT be surfaced:
        "rating": "BUY", "targetPrice": 90000, "projectedTSRPercentage": 27.1,
    }
}


def test_parse_vci_details_maps_and_drops_advisory() -> None:
    out = parse_vci_details(DETAILS_SAMPLE, "FPT")
    assert out["close_price"] == 70800.0
    assert out["market_cap"] == 120608  # 120.6e12 VND → tỷ
    assert out["industry"] == "Công nghệ Thông tin"
    assert out["company_name"] == "FPT Corp"
    # research-only: no advisory keys leak through
    assert "rating" not in out and "targetPrice" not in out


def test_parse_vci_details_empty() -> None:
    assert parse_vci_details({"data": {}}, "X") == {}


# --- shareholder-structure ownership ----------------------------------------

OWNERS_SAMPLE = {
    "data": {
        "statePercentage": 0.0567, "foreignPercentage": 0.2803,
        "bodPercentage": 0.1053, "institutionPercentage": 0.1893,
        "otherPercentage": 0.0, "nullField": None,
    }
}


def test_parse_vci_ownership_scales_and_labels() -> None:
    out = parse_vci_ownership(OWNERS_SAMPLE)
    names = {o["name"]: o["pct"] for o in out}
    assert names["Nhà nước"] == 5.67
    assert names["Nước ngoài"] == 28.03
    assert names["Ban lãnh đạo"] == 10.53
    # institution overlaps state/foreign → excluded; other (0.0) skipped
    assert "Tổ chức" not in names
    assert "Khác" not in names


def test_parse_vci_ownership_empty() -> None:
    assert parse_vci_ownership({"data": {}}) == []


# --- OHLC day change ---------------------------------------------------------

def test_parse_vci_ohlc_change_pct() -> None:
    out = parse_vci_ohlc([{"symbol": "FPT", "c": [71000, 70800, 70400]}])
    assert out["close_price"] == 70400
    assert out["change_pct"] == -0.56  # (70400-70800)/70800*100


def test_parse_vci_ohlc_accepts_envelope_and_single_bar() -> None:
    assert parse_vci_ohlc({"data": [{"c": [50000]}]}) == {"close_price": 50000}
    assert parse_vci_ohlc([]) == {}


def test_parse_vci_ohlc_series_builds_dated_bars() -> None:
    # 2024-01-01 ~ epoch 1704067200, 2024-01-02 ~ 1704153600 (UTC)
    payload = [
        {
            "symbol": "FPT",
            "o": [70000, 71000],
            "h": [72000, 72500],
            "l": [69500, 70800],
            "c": [71000, 70400],
            "v": [1000, 2000],
            "t": [1704067200, 1704153600],
        }
    ]
    bars = parse_vci_ohlc_series(payload)
    assert len(bars) == 2
    assert bars[0]["time"] == "2024-01-01"
    assert bars[0]["close"] == 71000 and bars[0]["open"] == 70000
    assert bars[1] == {
        "time": "2024-01-02", "open": 71000, "high": 72500, "low": 70800,
        "close": 70400, "volume": 2000,
    }


def test_parse_vci_ohlc_series_empty() -> None:
    assert parse_vci_ohlc_series([]) == []
    assert parse_vci_ohlc_series({"data": []}) == []


# --- income statement: profit chart + growth --------------------------------

IS_DICT = {
    "data": {
        "INCOME_STATEMENT": [
            {"field": "isa20", "titleEn": "Net profit/(loss) after tax",
             "titleVi": "Lãi/(lỗ) thuần sau thuế"},
            {"field": "isa22", "titleEn": "Attributable to parent company",
             "titleVi": "Lợi nhuận của Cổ đông của Công ty mẹ"},
        ]
    }
}
IS_STMT = {
    "data": {
        "quarters": [
            {"yearReport": 2026, "lengthReport": 1, "isa22": 2487.0e9},
            {"yearReport": 2025, "lengthReport": 4, "isa22": 2200.0e9},
            {"yearReport": 2025, "lengthReport": 3, "isa22": 2100.0e9},
            {"yearReport": 2025, "lengthReport": 1, "isa22": 2000.0e9},  # YoY base
        ]
    }
}


def test_pick_profit_field_prefers_parent_attributable() -> None:
    assert pick_profit_field(IS_DICT) == "isa22"


def test_parse_vci_income_series_and_growth() -> None:
    out = parse_vci_income(IS_STMT, IS_DICT, n=4)
    series = out["quarterly_profit"]
    # oldest → newest, value in tỷ VND
    assert [p["period"] for p in series] == ["Q1 '25", "Q3 '25", "Q4 '25", "Q1 '26"]
    assert series[-1]["value"] == 2487.0
    # YoY: 2026 Q1 vs 2025 Q1 = (2487-2000)/2000 ≈ 24.35%
    assert 24 < out["profit_growth"] < 25


def test_parse_vci_income_no_match_returns_empty() -> None:
    assert parse_vci_income(IS_STMT, {"data": {"INCOME_STATEMENT": []}}) == {}
    assert parse_vci_income({"data": {"quarters": []}}, IS_DICT) == {}


# --- balance sheet: charter capital + cash ----------------------------------

# Non-bank (FPT): bsa80 "Paid-in capital", bsa2 "Cash and cash equivalents".
BS_DICT_NONBANK = {
    "data": {
        "BALANCE_SHEET": [
            {"field": "bsa2", "titleVi": "Tiền và tương đương tiền",
             "titleEn": "Cash and cash equivalents"},
            {"field": "bsa80", "titleVi": "Vốn góp", "titleEn": "Paid-in capital"},
            {"field": "bsa276", "titleVi": "Vốn Góp liên doanh",
             "titleEn": "Investments in joint-venture"},  # must NOT win charter
        ]
    }
}
# Bank (VCB): same codes, different meanings — bsa80 is "Charter capital",
# bsa2 is vault cash ("Cash and precious metals") which must NOT match cash.
BS_DICT_BANK = {
    "data": {
        "BALANCE_SHEET": [
            {"field": "bsa2", "titleVi": "Tiền mặt, vàng bạc, đá quý",
             "titleEn": "Cash and precious metals"},
            {"field": "bsa80", "titleVi": "Vốn điều lệ", "titleEn": "Charter capital"},
        ]
    }
}
BS_STMT = {"data": {"quarters": [
    {"yearReport": 2026, "lengthReport": 1, "bsa2": 7993.0e9, "bsa80": 17035.0e9},
    {"yearReport": 2025, "lengthReport": 4, "bsa2": 5000.0e9, "bsa80": 17035.0e9},
]}}


def test_parse_vci_balance_sheet_nonbank() -> None:
    out = parse_vci_balance_sheet(BS_STMT, BS_DICT_NONBANK)
    assert out["charter_capital"] == 17035  # bsa80 (paid-in), not the JV line
    assert out["cash"] == 7993            # latest period (2026 Q1)


def test_parse_vci_balance_sheet_bank_skips_vault_cash() -> None:
    out = parse_vci_balance_sheet(BS_STMT, BS_DICT_BANK)
    assert out["charter_capital"] == 17035  # bsa80 "Charter capital"
    assert "cash" not in out  # bank vault cash is not matched → null


def test_parse_vci_balance_sheet_empty() -> None:
    assert parse_vci_balance_sheet({"data": {"quarters": []}}, BS_DICT_NONBANK) == {}


# --- resilient chain ---------------------------------------------------------

class _Stub:
    def __init__(self, name, listing=None, metrics=None, fail=False):
        self.name = name
        self._listing = listing or []
        self._metrics = metrics
        self._fail = fail
        self.list_calls = 0

    async def fetch_stock_list(self):
        self.list_calls += 1
        if self._fail:
            raise RuntimeError(f"{self.name} down")
        return self._listing

    async def fetch_stock_metrics(self, symbol):
        if self._fail:
            raise RuntimeError(f"{self.name} down")
        return self._metrics or FetchedMetrics(symbol=symbol)


@pytest.mark.asyncio
async def test_resilient_falls_back_on_failure() -> None:
    primary = _Stub("vci", fail=True)
    backup = _Stub("tcbs", listing=[FetchedStock(symbol="FPT")])
    rp = ResilientProvider([primary, backup])
    out = await rp.fetch_stock_list()
    assert [s.symbol for s in out] == ["FPT"]
    assert primary.list_calls == 1  # primary was tried first


@pytest.mark.asyncio
async def test_resilient_falls_back_on_empty_metrics() -> None:
    primary = _Stub("vci", metrics=FetchedMetrics(symbol="FPT"))  # all-None → miss
    backup = _Stub("tcbs", metrics=FetchedMetrics(symbol="FPT", pe=12.0, roe=20.0))
    rp = ResilientProvider([primary, backup])
    m = await rp.fetch_stock_metrics("FPT")
    assert m.pe == 12.0


@pytest.mark.asyncio
async def test_resilient_prefers_primary_when_healthy() -> None:
    primary = _Stub("vci", metrics=FetchedMetrics(symbol="FPT", pe=9.0))
    backup = _Stub("tcbs", metrics=FetchedMetrics(symbol="FPT", pe=99.0))
    rp = ResilientProvider([primary, backup])
    m = await rp.fetch_stock_metrics("FPT")
    assert m.pe == 9.0
