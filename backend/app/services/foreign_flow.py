"""Foreign-flow (khối ngoại) market summary via CafeF.

CafeF's ``GDKhoiNgoai.ashx`` exposes a market-level foreign summary for the latest day
(``TradingReport``: foreign buy/sell volume+value and its share of the market). It does
NOT paginate a per-stock leaderboard (``PageIndex`` is ignored — every page returns the
same 20 alphabetical rows), so we surface the honest, reliable market total. Research-only:
descriptive flow numbers, no advice. Pure ``parse_foreign_summary`` is unit-tested.
"""
from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger("vnios.foreign")

_URL = "https://s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx"
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
_CACHE_TTL_SEC = 1800.0  # 30 min


def _num(v: object) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        v = v.replace("%", "").replace(",", "").strip()
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_foreign_summary(payload: object) -> dict:
    """CafeF response → market-level foreign summary (values in tỷ VND)."""
    if not isinstance(payload, dict):
        return {"available": False}
    data = payload.get("Data")
    if not isinstance(data, dict):
        return {"available": False}
    tr = data.get("TradingReport")
    if not isinstance(tr, dict):
        return {"available": False}

    buy_val = _num(tr.get("gtMua"))
    sell_val = _num(tr.get("gtBan"))
    net_val = (buy_val - sell_val) if buy_val is not None and sell_val is not None else None
    return {
        "available": True,
        "date": data.get("DateIndex"),
        "index": data.get("Index"),
        "buy_vol": _num(tr.get("klMua")),
        "sell_vol": _num(tr.get("klBan")),
        "buy_val": buy_val,   # tỷ VND
        "sell_val": sell_val,  # tỷ VND
        "net_val": net_val,    # tỷ VND (>0 = mua ròng)
        "pct_buy_val": _num(tr.get("percentBuyVal")),
        "pct_sell_val": _num(tr.get("percentSellVal")),
    }


_cache: dict[str, object] = {"at": 0.0, "summary": None}


async def fetch_foreign_summary(force: bool = False) -> dict:
    now = time.time()
    cached = _cache["summary"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return dict(cached)  # type: ignore[arg-type]

    try:
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=True, headers={"User-Agent": _UA, "Accept": "application/json"}
        ) as client:
            resp = await client.get(
                _URL, params={"Symbol": "", "StartDate": "", "EndDate": "", "PageIndex": 1, "PageSize": 1}
            )
            resp.raise_for_status()
            summary = parse_foreign_summary(resp.json())
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[foreign] fetch failed — %s", exc)
        if cached:
            stale = dict(cached)  # type: ignore[arg-type]
            stale["stale"] = True  # serving a prior snapshot; upstream is down
            return stale
        return {"available": False, "note": "Chưa lấy được dữ liệu khối ngoại."}

    if summary.get("available"):
        _cache["summary"] = summary
        _cache["at"] = now
    return summary
