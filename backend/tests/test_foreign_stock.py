"""Pure VCI per-stock foreign parser tests (no network)."""
from __future__ import annotations

from app.services.foreign_stock import parse_getlist

_SAMPLE = [
    {
        "listingInfo": {"symbol": "FPT"},
        "matchPrice": {
            "symbol": "FPT",
            "foreignBuyVolume": 4980129, "foreignSellVolume": 275045,
            "foreignBuyValue": 347157060400, "foreignSellValue": 19197420500,
            "currentRoom": 366526405, "totalRoom": 834718489,
        },
    }
]


def test_parse_getlist_computes_net_and_room() -> None:
    out = parse_getlist(_SAMPLE)
    fpt = out["FPT"]
    assert fpt["net_vol"] == 4980129 - 275045
    # values → tỷ VND; net buy ≈ 347.16 - 19.20 = 327.96
    assert fpt["buy_val"] == 347.157  # 347157060400 VND → tỷ, rounded 3dp
    assert round(fpt["net_val"], 2) == 327.96
    # room used = (total - current)/total*100
    assert fpt["room_used_pct"] == 56.1


def test_parse_getlist_tolerates_missing_fields() -> None:
    out = parse_getlist([{"matchPrice": {"symbol": "AAA"}}])
    a = out["AAA"]
    assert a["net_vol"] is None and a["net_val"] is None and a["room_used_pct"] is None


def test_parse_getlist_skips_rows_without_symbol_and_handles_data_wrapper() -> None:
    assert parse_getlist({"data": []}) == {}
    assert parse_getlist([{"matchPrice": {}}]) == {}  # no symbol → skipped
    assert parse_getlist("garbage") == {}
