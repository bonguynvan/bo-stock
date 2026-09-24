"""Unit tests for the VCI financial-statement parser (pure, synthetic payloads)."""
from __future__ import annotations

from app.services.statements import parse_vci_financial_statement

B = 1_000_000_000


def _dict(section: str, items: list[dict]) -> dict:
    return {"data": {section: items}}


def _data(years: list[dict]) -> dict:
    return {"data": {"years": years, "quarters": []}}


# INCOME dict: a decoy zero-value "gross revenue" sub-line + the real net revenue.
INCOME_DICT = _dict("INCOME_STATEMENT", [
    {"field": "isa1", "titleVi": "Doanh thu bán hàng và cung cấp dịch vụ", "titleEn": "Sales"},
    {"field": "isa3", "titleVi": "Doanh thu thuần", "titleEn": "Net sales"},
    {"field": "isa5", "titleVi": "Lợi nhuận gộp", "titleEn": "Gross profit"},
    {"field": "isa11", "titleVi": "Lãi/(lỗ) từ hoạt động kinh doanh", "titleEn": "Operating profit"},
    {"field": "isa22", "titleVi": "Lợi nhuận của Cổ đông của Công ty mẹ", "titleEn": "Attributable to parent"},
    {"field": "isa9", "titleVi": "Chi phí bán hàng", "titleEn": "Selling expenses"},
    {"field": "isa10", "titleVi": "Chi phí quản lý doanh nghiệp", "titleEn": "Admin expenses"},
])
BALANCE_DICT = _dict("BALANCE_SHEET", [
    {"field": "bsa53", "titleVi": "TỔNG CỘNG TÀI SẢN", "titleEn": "Total assets"},
    {"field": "bsa54", "titleVi": "NỢ PHẢI TRẢ", "titleEn": "Total liabilities"},
    {"field": "bsa1", "titleVi": "TÀI SẢN NGẮN HẠN", "titleEn": "Current assets"},
    {"field": "bsa55", "titleVi": "Nợ ngắn hạn", "titleEn": "Current liabilities"},
    {"field": "bsa67", "titleVi": "Nợ dài hạn", "titleEn": "Long-term liabilities"},
    {"field": "bsa8", "titleVi": "Các khoản phải thu", "titleEn": "Receivables"},
    {"field": "bsa29", "titleVi": "Tài sản cố định", "titleEn": "Fixed assets"},
    {"field": "bsa90", "titleVi": "Lãi chưa phân phối", "titleEn": "Retained earnings"},
    {"field": "bsa32", "titleVi": "Khấu hao lũy kế TSCĐ hữu hình", "titleEn": "Accumulated depreciation"},
])
CASHFLOW_DICT = _dict("CASH_FLOW", [
    {"field": "cfa2", "titleVi": "Khấu hao TSCĐ và BĐSĐT", "titleEn": "Depreciation"},
    {"field": "cfa18", "titleVi": "Lưu chuyển tiền tệ ròng từ các hoạt động sản xuất kinh doanh",
     "titleEn": "Operating activities"},
])


def _sections(income_rows, bal_rows, cf_rows):
    return {
        "INCOME_STATEMENT": (INCOME_DICT, _data(income_rows)),
        "BALANCE_SHEET": (BALANCE_DICT, _data(bal_rows)),
        "CASH_FLOW": (CASHFLOW_DICT, _data(cf_rows)),
    }


def test_parse_annual_maps_and_scales_to_billions() -> None:
    sections = _sections(
        [{"yearReport": 2024, "isa1": 0, "isa3": 62849 * B, "isa5": 15000 * B,
          "isa11": 11025 * B, "isa22": 7857 * B, "isa9": 5000 * B, "isa10": 8190 * B}],
        [{"yearReport": 2024, "bsa53": 72000 * B, "bsa54": 36272 * B, "bsa1": 45536 * B,
          "bsa55": 34836 * B, "bsa67": 1436 * B, "bsa8": 9000 * B, "bsa29": 5000 * B,
          "bsa90": 11031 * B, "bsa32": -9000 * B}],
        [{"yearReport": 2024, "cfa2": 2535 * B, "cfa18": 11704 * B}],
    )
    rows = parse_vci_financial_statement(sections, "year")
    assert len(rows) == 1
    r = rows[0]
    assert r["period"] == "2024" and r["period_type"] == "year"
    assert r["revenue"] == 62849  # net revenue, not the isa1=0 decoy
    assert r["gross_profit"] == 15000
    assert r["net_income"] == 7857 and r["operating_profit"] == 11025
    assert r["total_assets"] == 72000 and r["current_liabilities"] == 34836
    assert r["sga_expense"] == 13190  # selling 5000 + admin 8190
    assert r["depreciation"] == 2535  # from cash flow, NOT the -9000 BS accumulated line
    assert r["fields_available"] == 15


def test_bank_missing_income_fields_stay_none() -> None:
    # A bank has no "Doanh thu thuần"/"Lợi nhuận gộp" lines → those resolve to None.
    bank_income = _dict("INCOME_STATEMENT", [
        {"field": "isa22", "titleVi": "Lợi nhuận của Cổ đông của Công ty mẹ", "titleEn": "Attributable to parent"},
    ])
    sections = {
        "INCOME_STATEMENT": (bank_income, _data([{"yearReport": 2024, "isa22": 33831 * B}])),
        "BALANCE_SHEET": (BALANCE_DICT, _data([{"yearReport": 2024, "bsa53": 2085874 * B, "bsa90": 98332 * B}])),
        "CASH_FLOW": (CASHFLOW_DICT, _data([{"yearReport": 2024, "cfa18": 62000 * B}])),
    }
    r = parse_vci_financial_statement(sections, "year")[0]
    assert r["revenue"] is None and r["gross_profit"] is None  # not fabricated
    assert r["net_income"] == 33831 and r["operating_cashflow"] == 62000
    assert r["fields_available"] < 14
