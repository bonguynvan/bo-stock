"""Parse VCI financial-statement payloads → raw line items for the fraud models.

Title-keyword matching (not hard-coded codes) so it survives the bank/non-bank
code differences — e.g. banks have no "Doanh thu thuần"/"Giá vốn hàng bán", so
those fields resolve to None rather than a wrong line. Value-aware picking (max
non-zero among matching lines) avoids decoy zero/sub-line matches, same safeguard
as parse_vci_balance_sheet. Each field is resolved ONLY within its own section
(so depreciation comes from CASH_FLOW, not the balance-sheet "khấu hao lũy kế").
"""
from __future__ import annotations

_BILLION = 1_000_000_000


def _to_float(v: object) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


# field -> (SECTION, primary title keywords, secondary keywords)
_FIELDS: dict[str, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    # Balance sheet
    "current_assets": ("BALANCE_SHEET", ("tài sản ngắn hạn",), ()),
    "receivables": ("BALANCE_SHEET", ("các khoản phải thu",), ("phải thu ngắn hạn",)),
    "ppe": ("BALANCE_SHEET", ("tài sản cố định",), ("fixed assets",)),
    "total_assets": ("BALANCE_SHEET", ("tổng cộng tài sản",), ("total assets",)),
    "total_liabilities": ("BALANCE_SHEET", ("nợ phải trả",), ("total liabilities",)),
    "current_liabilities": ("BALANCE_SHEET", ("nợ ngắn hạn",), ("current liabilities",)),
    "long_term_liabilities": ("BALANCE_SHEET", ("nợ dài hạn",), ("long-term liabilities",)),
    "retained_earnings": (
        "BALANCE_SHEET", ("lãi chưa phân phối", "lnst chưa phân phối"), ("retained earnings",),
    ),
    # Income statement
    "revenue": ("INCOME_STATEMENT", ("doanh thu thuần",), ("net sales",)),
    "gross_profit": ("INCOME_STATEMENT", ("lợi nhuận gộp",), ("gross profit",)),
    "operating_profit": (
        "INCOME_STATEMENT", ("từ hoạt động kinh doanh",), ("operating profit",),
    ),
    "net_income": (
        "INCOME_STATEMENT", ("cổ đông của công ty mẹ",), ("thuần sau thuế", "net profit"),
    ),
    "sga_selling": ("INCOME_STATEMENT", ("chi phí bán hàng",), ("selling expenses",)),
    "sga_admin": ("INCOME_STATEMENT", ("chi phí quản lý",), ("admin expenses",)),
    # Cash flow
    "operating_cashflow": (
        "CASH_FLOW",
        ("lưu chuyển tiền tệ ròng từ các hoạt động sản xuất",
         "lưu chuyển tiền thuần từ hoạt động kinh doanh"),
        ("operating activities",),
    ),
    "depreciation": ("CASH_FLOW", ("khấu hao",), ("depreciation",)),
}

def _items(dictionary: dict, section: str) -> list:
    data = dictionary.get("data") if isinstance(dictionary, dict) else None
    return data.get(section, []) if isinstance(data, dict) else []


def _records(statement: dict, period_type: str) -> list:
    # VCI splits full-year rows ("years") from quarterly rows ("quarters").
    key = "years" if period_type == "year" else "quarters"
    data = statement.get("data") if isinstance(statement, dict) else None
    if isinstance(data, dict):
        return data.get(key, []) or []
    return data if isinstance(data, list) else []


def _resolve(items: list, record: dict, primary: tuple, secondary: tuple) -> float | None:
    def collect(kws: tuple) -> list[float]:
        vals: list[float] = []
        for it in items:
            t = ((it.get("titleVi") or "") + " " + (it.get("titleEn") or "")).lower()
            field = it.get("field")
            if field and any(k in t for k in kws):
                v = _to_float(record.get(field))
                if v:  # skip None and 0
                    vals.append(v)
        return vals
    prim = collect(primary)
    if prim:
        return max(prim, key=abs)
    sec = collect(secondary) if secondary else []
    return max(sec, key=abs) if sec else None


def parse_vci_financial_statement(
    sections: dict[str, tuple[dict, dict]], period_type: str = "year"
) -> list[dict]:
    """sections: {SECTION: (dictionary_payload, statement_payload)}. Returns one dict
    per annual period present, with raw line items in tỷ VND. sga_expense = selling +
    admin. fields_available counts non-null resolved fields (transparency)."""
    # Index each section's records by year for alignment across statements.
    by_section: dict[str, dict[int, dict]] = {}
    years: set[int] = set()
    for section, (_dic, stmt) in sections.items():
        recs: dict[int, dict] = {}
        for r in _records(stmt, period_type):
            yr = r.get("yearReport")
            if yr is None:
                continue
            recs[yr] = r
            years.add(yr)
        by_section[section] = recs

    out: list[dict] = []
    for yr in sorted(years):
        row: dict = {"period": str(yr), "period_type": period_type}
        resolved: dict[str, float | None] = {}
        for name, (section, prim, sec) in _FIELDS.items():
            dic, _stmt = sections.get(section, ({}, {}))
            items = _items(dic, section)
            rec = by_section.get(section, {}).get(yr)
            resolved[name] = _resolve(items, rec, prim, sec) if rec else None

        def bil(x: float | None) -> int | None:
            return None if x is None else int(round(x / _BILLION))

        selling = resolved.get("sga_selling")
        admin = resolved.get("sga_admin")
        sga = None if (selling is None and admin is None) else (abs(selling or 0) + abs(admin or 0))

        fields = {
            "current_assets": bil(resolved["current_assets"]),
            "receivables": bil(resolved["receivables"]),
            "ppe": bil(resolved["ppe"]),
            "total_assets": bil(resolved["total_assets"]),
            "total_liabilities": bil(resolved["total_liabilities"]),
            "current_liabilities": bil(resolved["current_liabilities"]),
            "long_term_liabilities": bil(resolved["long_term_liabilities"]),
            "retained_earnings": bil(resolved["retained_earnings"]),
            "revenue": bil(resolved["revenue"]),
            "gross_profit": bil(resolved["gross_profit"]),
            "net_income": bil(resolved["net_income"]),
            "operating_profit": bil(resolved["operating_profit"]),
            "sga_expense": bil(sga),
            "operating_cashflow": bil(resolved["operating_cashflow"]),
            "depreciation": bil(resolved["depreciation"]),
        }
        row.update(fields)
        row["fields_available"] = sum(1 for v in fields.values() if v is not None)
        # Skip empty shells (e.g. a year with no data in any section).
        if row["fields_available"] > 0:
            out.append(row)
    return out
