"""Pure-parser tests for the World Bank connector — network/DB-free."""
from __future__ import annotations

from app.services.worldbank import CountryPoint, parse_worldbank_latest, rank_country_points


def _payload(observations: list[dict]) -> list:
    # World Bank returns [meta, observations] with observations newest-first.
    return [{"page": 1, "total": len(observations)}, observations]


def test_takes_newest_non_null_value() -> None:
    obs = parse_worldbank_latest(
        _payload(
            [
                {"date": "2024", "value": None},  # newest but not yet reported
                {"date": "2023", "value": 5.05},
                {"date": "2022", "value": 8.02},
            ]
        )
    )
    assert obs is not None
    assert obs.date == "2023"
    assert obs.value == 5.05


def test_returns_none_when_all_null() -> None:
    assert parse_worldbank_latest(_payload([{"date": "2024", "value": None}])) is None


def test_handles_error_or_empty_payloads() -> None:
    assert parse_worldbank_latest(None) is None
    assert parse_worldbank_latest([]) is None
    assert parse_worldbank_latest([{"message": "bad request"}]) is None  # WB error is a 1-elem list
    assert parse_worldbank_latest([{"page": 1}, None]) is None
    assert parse_worldbank_latest([{"page": 1}, []]) is None


def test_coerces_numeric_strings() -> None:
    obs = parse_worldbank_latest(_payload([{"date": "2023", "value": "3.25"}]))
    assert obs is not None
    assert obs.value == 3.25


def test_rank_country_points_orders_high_to_low_nulls_last() -> None:
    pts = [
        CountryPoint("THA", "Thái Lan", 2.5, "2025"),
        CountryPoint("SGP", "Singapore", None, None),
        CountryPoint("VNM", "Việt Nam", 8.0, "2025"),
        CountryPoint("IDN", "Indonesia", 5.0, "2025"),
    ]
    ranked = rank_country_points(pts)
    assert [p.country for p in ranked] == ["VNM", "IDN", "THA", "SGP"]
