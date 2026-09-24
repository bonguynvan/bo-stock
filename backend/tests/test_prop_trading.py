"""Pure CafeF tự doanh (proprietary desk) parser tests (no network)."""
from __future__ import annotations

from app.services.prop_trading import parse_tudoanh

_SAMPLE = {
    "Data": {
        "TotalCount": 938,
        "DateIndex": "07/08/2026",
        "Index": "VNINDEX",
        "TradingReport": {"TongGtBan": 607293335000, "TongGtMua": 547751469000},
        "Data": {
            "ListDataTudoanh": [
                {"Symbol": "HPG", "Date": "07/08/2026", "KLcpMua": 1644150, "KlcpBan": 1822100,
                 "GtMua": 36353408000, "GtBan": 40096895000},
                {"Symbol": "HPG", "Date": "06/08/2026", "KLcpMua": 2004900, "KlcpBan": 2589400,
                 "GtMua": 44118145000, "GtBan": 56911035000},
            ]
        },
    },
    "Message": None,
    "Success": True,
}


def test_parse_tudoanh_picks_latest_and_computes_net() -> None:
    out = parse_tudoanh(_SAMPLE)
    assert out is not None
    assert out["symbol"] == "HPG"
    assert out["date"] == "2026-08-07"  # latest session, ISO-normalized
    assert out["net_vol"] == 1644150 - 1822100
    # values → tỷ VND; net = 36.353 - 40.097 = -3.743 (bán ròng)
    assert out["buy_val"] == 36.353
    assert out["sell_val"] == 40.097
    assert out["net_val"] == round((36353408000 - 40096895000) / 1_000_000_000, 3)
    assert out["net_val"] < 0


def test_parse_tudoanh_picks_max_date_regardless_of_order() -> None:
    reordered = {
        "Data": {"Data": {"ListDataTudoanh": [
            {"Symbol": "SSI", "Date": "03/08/2026", "KLcpMua": 1, "KlcpBan": 0,
             "GtMua": 1_000_000_000, "GtBan": 0},
            {"Symbol": "SSI", "Date": "05/08/2026", "KLcpMua": 10, "KlcpBan": 2,
             "GtMua": 5_000_000_000, "GtBan": 1_000_000_000},
        ]}}
    }
    out = parse_tudoanh(reordered)
    assert out is not None
    assert out["date"] == "2026-08-05"  # the newer row wins even though it's second
    assert out["net_val"] == 4.0


def test_parse_tudoanh_tolerates_empty_and_garbage() -> None:
    assert parse_tudoanh({"Data": {"Data": {"ListDataTudoanh": []}}}) is None
    assert parse_tudoanh({"Success": False, "Message": "symbol is null or empty", "Data": None}) is None
    assert parse_tudoanh("garbage") is None
    assert parse_tudoanh({}) is None
