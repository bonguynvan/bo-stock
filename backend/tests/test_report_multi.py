"""Multi-symbol report — HTML assembly (pure) + gather over the seeded session.

The PDF render (Chromium) is not exercised here; only the data assembly + HTML.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.services.report_multi import gather_multi, render_multi_html


def test_render_multi_html_has_table_and_cards() -> None:
    items = [
        {
            "symbol": "FPT",
            "name": "CTCP FPT",
            "metrics": {"pe": 12.0, "roe": 27.0, "close_price": 70000, "change_pct": 1.2},
            "lenses": [{"name": "Graham", "met": 3, "total": 5}, {"name": "Quality", "met": 4, "total": 5}],
            "fraud": {"beneish": "low_risk", "altman": "safe", "piotroski": 7},
        },
        {
            "symbol": "VCB",
            "name": "Vietcombank",
            "metrics": {"pe": 9.0, "roe": 18.0, "close_price": 60000, "change_pct": -0.5},
            "lenses": [{"name": "Graham", "met": 2, "total": 5}, {"name": "Quality", "met": 3, "total": 5}],
            "fraud": None,
        },
    ]
    html = render_multi_html(items, datetime(2026, 7, 30, tzinfo=timezone.utc))
    assert "So sánh cổ phiếu" in html
    assert "<th>FPT</th>" in html and "<th>VCB</th>" in html
    assert "P/E" in html and "ROE %" in html
    assert "Graham: 3/5" in html          # lens summary for FPT
    assert "low_risk" in html             # fraud line for FPT
    assert "chưa có điểm sàng lọc" in html  # VCB has no fraud row
    assert "khuyến nghị" in html          # disclaimer present


async def test_gather_multi_builds_items_from_session(session) -> None:
    items = await gather_multi(session, ["AAA", "BBB", "ZZZ"])  # ZZZ unknown → dropped
    assert [it["symbol"] for it in items] == ["AAA", "BBB"]
    # Each item carries the three lenses and a metrics dict.
    assert {l["key"] for l in items[0]["lenses"]} == {"graham", "lynch", "quality"}
    assert items[0]["metrics"]["roe"] == 30.0  # AAA fixture
