"""Unit tests for the LLM JSON parsing / normalization (no network)."""
from __future__ import annotations

import pytest

from app.services.llm import _extract_json, normalize_analysis


def test_extract_json_plain() -> None:
    assert _extract_json('{"summary":"ok"}') == {"summary": "ok"}


def test_extract_json_with_code_fence_and_prose() -> None:
    text = 'Đây là kết quả:\n```json\n{"summary":"abc","risk_flags":[]}\n```\nHết.'
    assert _extract_json(text) == {"summary": "abc", "risk_flags": []}


def test_extract_json_raises_without_object() -> None:
    with pytest.raises(ValueError):
        _extract_json("không có json ở đây")


def test_normalize_analysis_coerces_shape() -> None:
    raw = {
        "key_figures": [
            {"label": "Doanh thu", "value": "12,480", "unit": "tỷ"},
            {"label": "EPS", "value": 1460},  # numeric value, no unit
            {"value": "no label dropped"},  # dropped (no label)
        ],
        "summary": "Tóm tắt",
        "yoy_changes": ["LN +14%", None, ""],  # blanks dropped
        "risk_flags": ["Nợ tăng"],
    }
    out = normalize_analysis(raw)
    assert out["summary"] == "Tóm tắt"
    assert out["yoy_changes"] == ["LN +14%"]
    assert out["risk_flags"] == ["Nợ tăng"]
    assert len(out["key_figures"]) == 2
    assert out["key_figures"][1] == {"label": "EPS", "value": "1460", "unit": None}


def test_normalize_analysis_empty() -> None:
    out = normalize_analysis({})
    # Core fields default empty…
    assert out["key_figures"] == []
    assert out["summary"] == ""
    assert out["yoy_changes"] == []
    assert out["risk_flags"] == []
    # …and so do the extended fields (no fabrication on missing input).
    assert out["multi_year_trend"]["years"] == []
    assert out["multi_year_trend"]["note"] == ""
    assert out["asset_structure"] == []
    assert out["capital_structure"] == []
    assert out["revenue_breakdown"] == {"items": [], "note": ""}
    assert out["ratios"] == []
    assert out["cashflow"]["operating"] == {"net": None, "items": []}
    assert out["notes"] == []


def test_normalize_analysis_extended_coercion() -> None:
    raw = {
        "multi_year_trend": {
            "years": ["2023", "2024", "2025"],
            "revenue": ["48.40", 82.29, None],  # strings, floats, null
            "net_margin_pct": ["41.4%", -58.1, None],
            "note": "đủ 3 năm",
        },
        "asset_structure": [
            {"label": "Tiền", "value": "10.35", "pct": 9.6},
            {"value": 5},  # dropped (no label)
        ],
        "revenue_breakdown": {"items": [], "note": "không có dữ liệu"},
        "ratios": [
            {"label": "ROE", "value": 36.8, "benchmark": "cần so sánh ngành"},
            {"value": "x"},  # dropped (no label)
        ],
        "cashflow": {
            "operating": {"net": "20.38", "items": [{"label": "Khấu hao", "value": 3.1}]},
            "investing": {"net": -19.38, "items": []},
        },
        "notes": ["Tranh chấp lô thép 2008", ""],
    }
    out = normalize_analysis(raw)
    assert out["multi_year_trend"]["revenue"] == [48.40, 82.29, None]
    assert out["multi_year_trend"]["net_margin_pct"] == [41.4, -58.1, None]
    assert out["asset_structure"] == [{"label": "Tiền", "value": 10.35, "pct": 9.6}]
    assert out["revenue_breakdown"]["note"] == "không có dữ liệu"
    assert out["ratios"] == [{"label": "ROE", "value": "36.8", "benchmark": "cần so sánh ngành"}]
    assert out["cashflow"]["operating"]["net"] == 20.38
    assert out["cashflow"]["operating"]["items"] == [{"label": "Khấu hao", "value": 3.1}]
    assert out["cashflow"]["financing"] == {"net": None, "items": []}  # missing → default
    assert out["notes"] == ["Tranh chấp lô thép 2008"]
