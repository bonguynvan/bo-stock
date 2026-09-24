"""Unit tests for merging multi-year BCTC trends."""
from __future__ import annotations

from app.services.trend_merge import merge_trends


def test_empty() -> None:
    assert merge_trends([]) == {}
    assert merge_trends([{"years": []}]) == {}


def test_single_trend_passthrough() -> None:
    t = {"years": ["2023", "2024"], "revenue": [100.0, 120.0], "net_profit": [10.0, 12.0]}
    merged = merge_trends([t])
    assert merged["years"] == ["2023", "2024"]
    assert merged["revenue"] == [100.0, 120.0]
    assert merged["net_profit"] == [10.0, 12.0]


def test_union_and_sort_across_reports() -> None:
    # 2024 report covers 2023-2024; 2022 report covers 2021-2022 → union 2021-2024.
    r2024 = {"years": ["2023", "2024"], "net_profit": [30.0, 35.0]}
    r2022 = {"years": ["2021", "2022"], "net_profit": [20.0, 25.0]}
    merged = merge_trends([r2022, r2024])  # order shouldn't matter
    assert merged["years"] == ["2021", "2022", "2023", "2024"]
    assert merged["net_profit"] == [20.0, 25.0, 30.0, 35.0]


def test_audited_source_wins_on_overlap() -> None:
    # Both cover 2023. The 2023 report is the audited primary source for 2023;
    # the 2024 report's *comparative* for 2023 was restated to 999 but must NOT win.
    r2023 = {"years": ["2022", "2023"], "net_profit": [20.0, 30.0]}
    r2024 = {"years": ["2023", "2024"], "net_profit": [999.0, 40.0]}
    merged = merge_trends([r2023, r2024])
    assert merged["years"] == ["2022", "2023", "2024"]
    # 2023 value comes from the 2023 report (30.0), not the 2024 restated 999.
    assert merged["net_profit"] == [20.0, 30.0, 40.0]


def test_fills_null_from_other_report() -> None:
    # The audited 2023 report lacks OCF for 2023; a later report supplies it.
    r2023 = {"years": ["2023"], "net_profit": [30.0], "operating_cashflow": [None]}
    r2024 = {"years": ["2023", "2024"], "operating_cashflow": [28.0, 33.0]}
    merged = merge_trends([r2023, r2024])
    assert merged["operating_cashflow"][merged["years"].index("2023")] == 28.0


def test_note_reflects_span() -> None:
    merged = merge_trends(
        [{"years": ["2021", "2022"], "revenue": [1.0, 2.0]},
         {"years": ["2023", "2024"], "revenue": [3.0, 4.0]}]
    )
    assert "2021" in merged["note"] and "2024" in merged["note"]
