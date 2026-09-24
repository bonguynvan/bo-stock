"""Tests for the multi-source news channels (registry + parsing, network-free)."""
from __future__ import annotations

from app.services import news


def test_list_channels_has_vn_world_macro() -> None:
    keys = {c["key"] for c in news.list_channels()}
    assert {"vn", "world", "macro"} <= keys
    # Every channel exposes a human label.
    assert all(c["label"] for c in news.list_channels())


async def test_channel_news_unknown_channel_is_empty() -> None:
    assert await news.channel_news("does-not-exist") == []


def test_parse_rss_dedupe_shape() -> None:
    xml = """<?xml version="1.0"?><rss><channel>
      <item><title>Tin A</title><link>http://x/a</link><pubDate>Tue, 01 Jul 2025 08:00:00 +0700</pubDate></item>
      <item><title>Tin B</title><link>http://x/b</link><description>&lt;p&gt;Nội dung&lt;/p&gt;</description></item>
    </channel></rss>"""
    items = news.parse_rss(xml, default_source="CafeF")
    assert [i["title"] for i in items] == ["Tin A", "Tin B"]
    assert items[0]["source"] == "CafeF"
    assert items[0]["published_iso"] is not None
    assert items[1]["summary"] == "Nội dung"  # HTML stripped
