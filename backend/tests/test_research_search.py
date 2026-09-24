"""Unit tests for research auto-search (pure ranking + status logic)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.services import research_search as rs

NOW = datetime(2026, 7, 2, tzinfo=timezone.utc)
NAME = rs._distinctive("CTCP Thủy điện Sông Ba Hạ")  # -> "sông ba hạ"


def test_distinctive_is_proper_name_tail() -> None:
    assert NAME == "sông ba hạ"
    assert rs._distinctive(None) == ""


def test_relevance_high_needs_company_and_recency() -> None:
    recent = "2026-06-17T00:00:00+00:00"
    old = "2024-01-01T00:00:00+00:00"
    # distinctive proper-name + recent → high
    assert rs._relevance("Thủy điện Sông Ba Hạ tổ chức ĐHĐCĐ 2026", recent, "SBH", NAME, NOW) == "high"
    # symbol as standalone token → high
    assert rs._relevance("Lãnh đạo SBH xin từ nhiệm", recent, "SBH", NAME, NOW) == "high"
    # other hydropower firm sharing generic words "thủy điện" → medium (not the proper name)
    assert rs._relevance("ĐHCĐ PECC1: Mạnh tay chia cổ tức thủy điện", recent, "SBH", NAME, NOW) == "medium"
    # unrelated bank (SHB) → medium
    assert rs._relevance("SHB hướng đến mục tiêu 1 triệu tỷ", recent, "SBH", NAME, NOW) == "medium"
    # relevant but stale → medium
    assert rs._relevance("Thủy điện Sông Ba Hạ lãi lớn", old, "SBH", NAME, NOW) == "medium"


async def test_answer_one_status(monkeypatch) -> None:
    async def fake_search(kw: str, limit: int = 5):
        if "cổ tức" in kw:
            return [{
                "title": "Thủy điện Sông Ba Hạ chốt quyền cổ tức 2025",
                "link": "https://cafef.vn/x", "source": "CafeF",
                "published_iso": "2026-06-01T00:00:00+00:00", "summary": "..." * 60,
            }]
        return []

    monkeypatch.setattr(rs.news, "search_news", fake_search)

    found = await rs._answer_one("SBH", NAME, {"question": "Cổ tức 2025?", "search_keywords": ["SBH cổ tức 2025"]}, NOW)
    assert found["status"] == "found" and found["findings"][0]["relevance"] == "high"
    assert len(found["findings"][0]["snippet"]) <= 100  # copyright: short

    empty = await rs._answer_one("SBH", NAME, {"question": "X?", "search_keywords": ["không có gì"]}, NOW)
    assert empty["status"] == "not_found" and empty["findings"] == []
