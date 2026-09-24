"""Per-stock foreign (khối ngoại) flow via the VCI price board.

VCI's ``POST /api/price/symbols/getList`` returns, per symbol, a ``matchPrice`` block with
``foreignBuyVolume``/``foreignSellVolume`` (shares), ``foreignBuyValue``/``foreignSellValue``
(VND), and ``currentRoom``/``totalRoom`` (foreign-ownership room, shares) — the latest
session's foreign trading + room. This is the per-stock foreign source (CafeF only exposes a
market-level total). Research-only, descriptive. Pure ``parse_getlist`` is unit-tested; the
fetch does the VCI WAF handshake + POST and is TTL-cached.
"""
from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger("vnios.foreign_stock")

_URL = "https://trading.vietcap.com.vn/api/price/symbols/getList"
_HANDSHAKE = "https://trading.vietcap.com.vn/priceboard"
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
_BILLION = 1_000_000_000  # VND → tỷ VND
_TTL_SEC = 300.0  # 5 min (intraday-ish)
_MAX_BATCH = 60  # cap symbols per getList request


def _f(v: object) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_getlist(payload: object) -> dict[str, dict]:
    """VCI getList response → {SYMBOL: foreign metrics}. Values in tỷ VND; volumes in shares."""
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("data") or []
    else:
        rows = []
    out: dict[str, dict] = {}
    for it in rows:
        if not isinstance(it, dict):
            continue
        mp = it.get("matchPrice") or {}
        sym = str(mp.get("symbol") or (it.get("listingInfo") or {}).get("symbol") or "").upper()
        if not sym:
            continue
        bv, sv = _f(mp.get("foreignBuyVolume")), _f(mp.get("foreignSellVolume"))
        bval, sval = _f(mp.get("foreignBuyValue")), _f(mp.get("foreignSellValue"))
        cur, tot = _f(mp.get("currentRoom")), _f(mp.get("totalRoom"))
        net_vol = (bv - sv) if bv is not None and sv is not None else None
        net_val = ((bval - sval) / _BILLION) if bval is not None and sval is not None else None
        room_used = ((tot - cur) / tot * 100) if cur is not None and tot else None
        out[sym] = {
            "symbol": sym,
            "buy_vol": bv,
            "sell_vol": sv,
            "net_vol": net_vol,
            "buy_val": round(bval / _BILLION, 3) if bval is not None else None,   # tỷ VND
            "sell_val": round(sval / _BILLION, 3) if sval is not None else None,  # tỷ VND
            "net_val": round(net_val, 3) if net_val is not None else None,        # tỷ VND (>0 = mua ròng)
            "current_room": cur,   # shares foreign can still buy
            "total_room": tot,
            "room_used_pct": round(room_used, 1) if room_used is not None else None,
        }
    return out


async def _fetch_getlist(symbols: list[str]) -> object:
    async with httpx.AsyncClient(
        timeout=15.0, follow_redirects=True,
        headers={"User-Agent": _UA, "Referer": "https://trading.vietcap.com.vn/",
                 "Accept": "application/json", "Content-Type": "application/json"},
    ) as client:
        try:
            await client.get(_HANDSHAKE)  # warm the WAF (best-effort)
        except httpx.HTTPError:
            pass
        resp = await client.post(_URL, json={"symbols": [s.upper() for s in symbols]})
        resp.raise_for_status()
        return resp.json()


_cache: dict[str, tuple[float, dict]] = {}


async def get_many(symbols: list[str]) -> dict[str, dict]:
    """Batch foreign flow for many symbols in one getList call (best-effort → {} on failure).

    Used to overlay foreign net onto the radar / movers cheaply. Also warms the per-symbol
    cache so a later detail view is instant."""
    syms = [s.upper() for s in dict.fromkeys(s for s in symbols if s)][:_MAX_BATCH]
    if not syms:
        return {}
    try:
        parsed = parse_getlist(await _fetch_getlist(syms))
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[foreign_stock] batch fetch failed — %s", exc)
        return {}
    now = time.time()
    for sym, d in parsed.items():
        d["available"] = True
        _cache[sym] = (now, d)
    return parsed


async def get_symbol_foreign(symbol: str, force: bool = False) -> dict:
    """Latest-session foreign flow + room for a symbol (VCI). TTL-cached."""
    sym = symbol.upper()
    now = time.time()
    hit = _cache.get(sym)
    if not force and hit and now - hit[0] < _TTL_SEC:
        return hit[1]
    try:
        parsed = parse_getlist(await _fetch_getlist([sym]))
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[foreign_stock] fetch %s failed — %s", sym, exc)
        return {"available": False, "symbol": sym, "note": "Chưa lấy được dữ liệu khối ngoại."}
    data = parsed.get(sym)
    if not data:
        return {"available": False, "symbol": sym,
                "note": "Không có dữ liệu khối ngoại cho mã này."}
    data["available"] = True
    _cache[sym] = (now, data)
    return data
