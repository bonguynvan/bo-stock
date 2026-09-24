"""Pure tests for the news-signals normalizer (no network / no AI call)."""
from __future__ import annotations

from app.services.llm import normalize_news_signals

ITEMS = [
    {"title": "Công ty A bị xử phạt thuế 5 tỷ", "source": "CafeF",
     "published_iso": "2026-07-30T08:00:00+07:00", "link": "https://x/1"},
    {"title": "Chủ tịch A đăng ký bán 2 triệu cổ phiếu", "source": "Vietstock",
     "published_iso": "2026-07-29T08:00:00+07:00", "link": "https://x/2"},
]


def test_normalizer_uses_authoritative_item_metadata() -> None:
    raw = {
        "signals": [
            {"i": 0, "event_type": "regulatory_legal", "sentiment": "negative",
             "extract": "Bị xử phạt thuế 5 tỷ.", "source": "MODEL-LIED", "link": "evil"},
            {"i": 1, "event_type": "insider_shareholder", "sentiment": "negative",
             "extract": "Chủ tịch đăng ký bán."},
        ],
        "summary": {"net_sentiment": "negative", "dominant_events": ["regulatory_legal"],
                    "note": "Tin chưa kiểm chứng."},
    }
    out = normalize_news_signals(raw, ITEMS)
    assert len(out["signals"]) == 2
    s0 = out["signals"][0]
    # link/source/published come from ITEMS, NOT from the model
    assert s0["link"] == "https://x/1" and s0["source"] == "CafeF"
    assert s0["event_type"] == "regulatory_legal" and s0["sentiment"] == "negative"
    assert out["summary"]["net_sentiment"] == "negative"


def test_normalizer_coerces_unknown_enums_and_skips_bad_rows() -> None:
    raw = {
        "signals": [
            {"i": 0, "event_type": "WEIRD", "sentiment": "bullish", "extract": "x"},  # coerced
            {"i": 99, "extract": "no such item, no headline"},  # dropped (no title/headline)
            "not a dict",  # dropped
        ],
        "summary": {"net_sentiment": "??"},
    }
    out = normalize_news_signals(raw, ITEMS)
    assert len(out["signals"]) == 1
    assert out["signals"][0]["event_type"] == "other"  # unknown → other
    assert out["signals"][0]["sentiment"] == "neutral"  # unknown → neutral
    assert out["summary"]["net_sentiment"] == "neutral"


def test_normalizer_empty() -> None:
    out = normalize_news_signals({"signals": [], "summary": {}}, ITEMS)
    assert out["signals"] == []
    assert out["summary"]["net_sentiment"] == "neutral"
