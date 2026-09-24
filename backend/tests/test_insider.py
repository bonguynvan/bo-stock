"""Pure VCI insider-transaction parser/summary tests (no network)."""
from __future__ import annotations

from datetime import datetime

from app.services.insider import parse_insider, summarize_insider

_PAYLOAD = {
    "data": {
        "content": [
            {  # completed buy (signed +), newest
                "publicDate": "2026-06-05T00:00:00", "startDate": "2026-06-11T00:00:00",
                "endDate": "2026-07-10T00:00:00", "ticker": "HPG",
                "traderNameVi": "Trần Vũ Minh", "traderPositionVi": "Thành viên HĐQT",
                "actionTypeVi": "Mua", "actionTypeCode": "B",
                "tradeStatusVi": "Đã thực hiện xong",
                "shareRegister": 50000000.0, "shareAcquire": 33291904.0,
                "ownershipAfterTrade": 0.02732, "eventCode": "DDIND",
                "sourceUrlVi": "http://x/1",
            },
            {  # completed sell (signed −)
                "publicDate": "2026-05-01T00:00:00",
                "traderNameVi": "Chu Quang Việt", "traderPositionVi": "Kế toán trưởng",
                "actionTypeVi": "Bán", "actionTypeCode": "S",
                "tradeStatusVi": "Đã thực hiện xong",
                "shareRegister": 50000.0, "shareAcquire": -50000.0,
                "ownershipAfterTrade": 0.000015, "eventCode": "DDIND",
            },
            {  # still only registered → excluded from the net
                "publicDate": "2026-06-20T00:00:00",
                "traderNameVi": "Nguyễn A", "actionTypeVi": "Bán",
                "tradeStatusVi": "Đăng ký", "shareRegister": 1000000.0, "shareAcquire": 0.0,
            },
        ]
    }
}


def test_parse_insider_normalizes_and_sorts_newest_first() -> None:
    deals = parse_insider(_PAYLOAD)
    assert [d["public_date"] for d in deals] == ["2026-06-20", "2026-06-05", "2026-05-01"]
    buy = next(d for d in deals if d["trader"] == "Trần Vũ Minh")
    assert buy["action"] == "Mua" and buy["status"] == "done"
    assert buy["transacted_shares"] == 33291904.0  # signed +
    assert buy["ownership_after_pct"] == 2.732      # fraction → percent
    reg = next(d for d in deals if d["trader"] == "Nguyễn A")
    assert reg["status"] == "registered"


def test_summarize_insider_nets_completed_buys_and_sells() -> None:
    deals = parse_insider(_PAYLOAD)
    s = summarize_insider(deals, now=datetime(2026, 7, 1), window_days=180)
    # 33,291,904 (buy) − 50,000 (sell) = 33,241,904; the registered filing is excluded
    assert s["net_shares"] == 33241904
    assert s["buy_count"] == 1 and s["sell_count"] == 1
    assert s["direction"] == "buy"


def test_summarize_window_excludes_old_deals() -> None:
    deals = parse_insider(_PAYLOAD)
    # A 10-day window ending 2026-07-01 excludes everything → neutral.
    s = summarize_insider(deals, now=datetime(2026, 7, 1), window_days=10)
    assert s == {"window_days": 10, "net_shares": 0, "buy_count": 0, "sell_count": 0, "direction": "neutral"}


def test_parse_insider_tolerates_garbage() -> None:
    assert parse_insider("nope") == []
    assert parse_insider({}) == []
    assert parse_insider({"data": {"content": "x"}}) == []
    assert parse_insider({"data": {"content": [42, {"publicDate": None}]}})[0]["public_date"] is None
