"""Unit tests for the pure report-rendering helpers."""
from __future__ import annotations

from app.services.report_pdf import _band, _num, _pct, _svg_bars


def test_num_and_pct() -> None:
    assert _num(1234567) == "1,234,567"
    assert _num(12.34, 1) == "12.3"
    assert _num(None) == "—"
    assert _pct(3.29, 2) == "+3.29%"
    assert _pct(-5, 1) == "-5.0%"
    assert _pct(None) == "—"


def test_band_thresholds() -> None:
    assert _band(80) == "#1f9d55"  # green
    assert _band(50) == "#c88a12"  # amber
    assert _band(20) == "#c0392b"  # red
    assert _band(None) == "#8a8a8a"


def test_svg_bars_renders_and_skips_empty() -> None:
    svg = _svg_bars([{"year": 2024, "roe": 20.0}, {"year": 2025, "roe": 28.0}], "roe", "ROE %", "#000")
    assert svg.startswith("<svg") and "2024" in svg and "2025" in svg
    assert _svg_bars([], "roe", "x", "#000") == ""
    assert _svg_bars([{"year": 2024, "roe": None}], "roe", "x", "#000") == ""
