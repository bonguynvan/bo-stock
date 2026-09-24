"""Unit tests for the pure portfolio helpers."""
from __future__ import annotations

from app.services.portfolio import _allocate, _pct


def test_pct() -> None:
    assert _pct(25, 100) == 25.0
    assert _pct(1, 3) == 33.33
    assert _pct(5, 0) is None


def test_allocate_groups_and_sorts_desc() -> None:
    holdings = [
        {"industry": "Ngân hàng", "market_value": 300},
        {"industry": "Bán lẻ", "market_value": 100},
        {"industry": "Ngân hàng", "market_value": 200},
        {"industry": "Bán lẻ", "market_value": None},  # unpriced → skipped
    ]
    out = _allocate(holdings, "industry", total=600)
    assert [s["label"] for s in out] == ["Ngân hàng", "Bán lẻ"]  # by value desc
    bank = out[0]
    assert bank["value"] == 500 and bank["count"] == 2 and bank["pct"] == 83.33


def test_allocate_labels_missing_field() -> None:
    out = _allocate([{"industry": None, "market_value": 100}], "industry", 100)
    assert out[0]["label"] == "Không rõ"
