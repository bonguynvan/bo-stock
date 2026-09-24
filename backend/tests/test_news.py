"""Unit tests for the pure RSS parser."""
from __future__ import annotations

from app.services.news import parse_rss

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>CafeF</title>
  <item>
    <title><![CDATA[VN-Index hồi phục phiên 02/07]]></title>
    <link>https://cafef.vn/a.chn</link>
    <pubDate>Wed, 02 Jul 2026 09:30:00 +0700</pubDate>
    <description><![CDATA[<p>Thị trường <b>tăng</b> điểm.</p>]]></description>
  </item>
  <item>
    <title>FPT dẫn dắt nhóm công nghệ</title>
    <link>https://news.google.com/b</link>
    <pubDate>Wed, 02 Jul 2026 08:00:00 +0700</pubDate>
    <source url="https://cafef.vn">CafeF</source>
  </item>
  <item><title>No link item</title></item>
</channel></rss>"""


def test_parse_rss_extracts_items() -> None:
    items = parse_rss(RSS, default_source="CafeF")
    assert len(items) == 2  # the link-less item is dropped
    a = items[0]
    assert a["title"] == "VN-Index hồi phục phiên 02/07"
    assert a["link"] == "https://cafef.vn/a.chn"
    assert a["summary"] == "Thị trường tăng điểm."  # HTML stripped
    assert a["published_iso"].startswith("2026-07-02T09:30:00")
    assert a["source"] == "CafeF"  # default applied
    assert items[1]["source"] == "CafeF"  # from <source> element


def test_parse_rss_limit_and_bad_xml() -> None:
    assert parse_rss(RSS, limit=1)[0]["title"].startswith("VN-Index")
    assert len(parse_rss(RSS, limit=1)) == 1
    assert parse_rss("not xml at all") == []
    assert parse_rss("") == []


async def test_personalized_dedups_tags_and_sorts(monkeypatch) -> None:
    from app.services import news

    feeds = {
        "AAA": [{"title": "a1", "link": "L1", "published_iso": "2026-07-01T00:00:00", "source": "S", "summary": ""}],
        "BBB": [
            {"title": "b-dup", "link": "L1", "published_iso": "2026-07-05T00:00:00", "source": "S", "summary": ""},
            {"title": "b2", "link": "L2", "published_iso": "2026-07-03T00:00:00", "source": "S", "summary": ""},
        ],
    }

    async def fake_symbol_news(symbol: str, limit: int = 20):
        return feeds[symbol.upper()]

    monkeypatch.setattr(news, "symbol_news", fake_symbol_news)
    out = await news.personalized_news(["aaa", "bbb", "aaa"])  # dup symbol collapsed
    links = [x["link"] for x in out]
    assert links == ["L2", "L1"]  # L1 deduped (AAA wins), sorted newest-first
    assert out[0]["symbol"] == "BBB" and out[1]["symbol"] == "AAA"
