"""Pure-parser tests for the macro (FRED) connector — network/DB-free."""
from __future__ import annotations

from app.services.macro import parse_fred_latest


def test_picks_latest_non_missing_observation() -> None:
    payload = {
        "observations": [
            {"date": "2026-05-01", "value": "4.10"},
            {"date": "2026-06-01", "value": "4.25"},
        ]
    }
    obs = parse_fred_latest(payload)
    assert obs is not None
    assert obs.value == 4.25
    assert obs.date == "2026-06-01"


def test_skips_fred_missing_dot_values() -> None:
    payload = {
        "observations": [
            {"date": "2026-06-01", "value": "4.25"},
            {"date": "2026-07-01", "value": "."},  # FRED encodes missing as "."
        ]
    }
    obs = parse_fred_latest(payload)
    assert obs is not None
    assert obs.value == 4.25
    assert obs.date == "2026-06-01"


def test_empty_or_bad_payload_returns_none() -> None:
    assert parse_fred_latest({}) is None
    assert parse_fred_latest({"observations": []}) is None
    assert parse_fred_latest({"observations": [{"date": "x", "value": "."}]}) is None
    assert parse_fred_latest(None) is None
