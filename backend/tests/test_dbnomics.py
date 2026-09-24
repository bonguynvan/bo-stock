"""Pure-parser tests for the DBnomics connector — network/DB-free."""
from __future__ import annotations

from app.services.dbnomics import parse_dbnomics_latest


def _payload(periods: list[str], values: list) -> dict:
    return {"series": {"docs": [{"period": periods, "value": values}]}}


def test_takes_newest_at_or_before_max_period() -> None:
    p = _payload(["2022", "2023", "2024", "2025", "2030"], [8.0, 5.0, 6.1, 6.5, 6.9])
    obs = parse_dbnomics_latest(p, max_period=2026)
    assert obs is not None
    assert obs.period == "2025"  # 2030 is a far-out projection, excluded
    assert obs.value == 6.5


def test_no_cap_returns_the_last_value() -> None:
    p = _payload(["2024", "2025"], [6.1, 6.5])
    obs = parse_dbnomics_latest(p, max_period=None)
    assert obs is not None and obs.period == "2025" and obs.value == 6.5


def test_skips_non_numeric_values() -> None:
    p = _payload(["2023", "2024", "2025"], [5.0, "NA", None])
    obs = parse_dbnomics_latest(p, max_period=2026)
    assert obs is not None and obs.period == "2023" and obs.value == 5.0


def test_handles_bad_payloads() -> None:
    assert parse_dbnomics_latest(None) is None
    assert parse_dbnomics_latest({}) is None
    assert parse_dbnomics_latest({"series": {"docs": []}}) is None
    assert parse_dbnomics_latest({"series": {"docs": [{"period": "x"}]}}) is None


def test_all_values_above_cap_returns_none() -> None:
    p = _payload(["2028", "2029"], [6.0, 6.1])
    assert parse_dbnomics_latest(p, max_period=2026) is None
