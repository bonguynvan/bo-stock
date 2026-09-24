"""Unit tests for the consideration-summary normalizer (pure)."""
from __future__ import annotations

from app.services.llm import normalize_consideration


def test_normalizes_full_shape() -> None:
    raw = {
        "strengths": [
            {"point": "Không vay nợ", "evidence": "Lãi vay = 0", "significance": "Miễn nhiễm lãi suất"}
        ],
        "concerns": [
            {"point": "LN bất thường", "evidence": "Cổ tức ALS 26% LNST", "implication": "Ảo giác tăng trưởng"}
        ],
        "valuation_context": {
            "summary": "Giá cao hơn vùng định giá ~78%",
            "what_market_implies": "Kỳ vọng tăng trưởng cao",
            "key_uncertainty": "PE vs PB chênh lớn",
        },
        "questions_to_answer": ["VNA chiếm >50% doanh thu — sức khỏe tài chính VNA?"],
        "compass_interpretation": "Long-term 98.9 phản ánh nền tảng tốt.",
    }
    out = normalize_consideration(raw)
    assert out["strengths"][0]["significance"] == "Miễn nhiễm lãi suất"
    assert out["concerns"][0]["implication"] == "Ảo giác tăng trưởng"
    assert out["valuation_context"]["summary"].startswith("Giá cao")
    assert len(out["questions_to_answer"]) == 1
    assert "98.9" in out["compass_interpretation"]


def test_drops_valuation_and_compass_when_absent() -> None:
    out = normalize_consideration(
        {"strengths": [], "concerns": [], "questions_to_answer": []}
    )
    assert out["valuation_context"] is None
    assert out["compass_interpretation"] is None
    assert out["recent_developments"] == []


def test_recent_developments_normalized() -> None:
    out = normalize_consideration(
        {
            "recent_developments": [
                {"headline": "TGĐ mới từ 01/03", "note": "Theo dõi chiến lược mới"},
                {"note": "no headline → dropped"},
            ]
        }
    )
    assert len(out["recent_developments"]) == 1
    assert out["recent_developments"][0]["headline"] == "TGĐ mới từ 01/03"


def test_skips_malformed_points() -> None:
    out = normalize_consideration(
        {"strengths": [{"evidence": "no point key"}, {"point": "ok"}]}
    )
    assert [s["point"] for s in out["strengths"]] == ["ok"]  # point-less entry dropped
