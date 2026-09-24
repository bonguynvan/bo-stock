"""Pure normalize_filter tests + the no-key guard."""
from __future__ import annotations

import pytest

from app.services.nl_screener import build_filter, normalize_filter

SECTORS = ["Ngân hàng", "Công nghệ", "Bất động sản"]


def test_maps_known_numeric_fields() -> None:
    out = normalize_filter(
        {"roe_min": 18, "pb_max": "1.5", "dividend_yield_min": 5, "market_cap_min": 1000}, SECTORS
    )
    assert out == {"roe_min": 18.0, "pb_max": 1.5, "dividend_yield_min": 5.0, "market_cap_min": 1000}


def test_sector_case_insensitive_and_substring() -> None:
    assert normalize_filter({"sector": "ngân hàng"}, SECTORS)["sector"] == "Ngân hàng"
    assert normalize_filter({"sector": "công nghệ thông tin"}, SECTORS)["sector"] == "Công nghệ"
    assert "sector" not in normalize_filter({"sector": "thủy sản"}, SECTORS)


def test_exchange_filtered_to_valid() -> None:
    assert normalize_filter({"exchange": ["hose", "xyz", "HNX"]}, SECTORS)["exchange"] == ["HOSE", "HNX"]
    assert "exchange" not in normalize_filter({"exchange": ["xyz"]}, SECTORS)


def test_sort_and_limit_validated() -> None:
    out = normalize_filter({"sort_by": "roe", "sort_order": "asc", "limit": 5000}, SECTORS)
    assert out["sort_by"] == "roe" and out["sort_order"] == "asc" and out["limit"] == 2000
    # Invalid sort field/order are dropped.
    assert "sort_by" not in normalize_filter({"sort_by": "bogus"}, SECTORS)
    assert "sort_order" not in normalize_filter({"sort_order": "sideways"}, SECTORS)


def test_drops_unknown_and_bad_values() -> None:
    out = normalize_filter({"foo": 1, "roe_min": "abc", "exclude_beneish_high_risk": True}, SECTORS)
    assert out == {"exclude_beneish_high_risk": True}


def test_non_dict_is_empty() -> None:
    assert normalize_filter(None, SECTORS) == {}
    assert normalize_filter("x", SECTORS) == {}


async def test_build_filter_requires_api_key(session, monkeypatch) -> None:
    from app.config import get_settings
    from app.services.llm import LLMNotConfigured

    monkeypatch.setattr(get_settings(), "anthropic_api_key", None, raising=False)
    with pytest.raises(LLMNotConfigured):
        await build_filter(session, "ngân hàng ROE cao")
