"""Per-stock proprietary-desk (tự doanh) flow via CafeF.

CafeF's ``GDTuDoanh.ashx`` returns, per symbol, a daily time series of self-trading
(tự doanh) by securities firms: ``KLcpMua``/``KlcpBan`` (shares bought/sold),
``GtMua``/``GtBan`` (VND bought/sold). We keep the latest session — a second
organizational-flow lens alongside khối ngoại (foreign). Research-only, descriptive.

Endpoint note: the canonical host is ``cafef.vn/du-lieu/ajax/...``. The ``s.cafef.vn``
alias 301-redirects and DROPS the query string (→ "symbol is null or empty"), so we hit
the canonical URL directly. Pure ``parse_tudoanh`` is unit-tested; the fetch is TTL-cached.
"""
from __future__ import annotations

import asyncio
import logging
import time

import httpx

logger = logging.getLogger("vnios.prop_trading")

# Canonical host — do NOT use s.cafef.vn (301 drops the query string).
_URL = "https://cafef.vn/du-lieu/ajax/pagenew/datahistory/gdtudoanh.ashx"
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
_BILLION = 1_000_000_000  # VND → tỷ VND
_TTL_SEC = 300.0  # 5 min (intraday-ish)
_MAX_BATCH = 40  # cap symbols per overlay call
_CONCURRENCY = 10  # one GET per symbol; keep radar overlay latency bounded
_PAGE_SIZE = 5  # only need the latest session; a few rows for safety


def _f(v: object) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _iso_date(d: object) -> str | None:
    """CafeF ``dd/MM/yyyy`` → ISO ``yyyy-mm-dd`` (None if unparseable)."""
    if not isinstance(d, str):
        return None
    parts = d.split("/")
    if len(parts) != 3:
        return None
    dd, mm, yy = (p.strip() for p in parts)
    if not (dd.isdigit() and mm.isdigit() and yy.isdigit()):
        return None
    return f"{yy}-{mm.zfill(2)}-{dd.zfill(2)}"


def parse_tudoanh(payload: object) -> dict | None:
    """CafeF GDTuDoanh response → latest-session tự doanh metrics for one symbol.

    ``net_val`` in tỷ VND (>0 = tự doanh mua ròng); volumes in shares. Returns None when
    there are no rows (mã không có dữ liệu tự doanh)."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("Data")
    if not isinstance(data, dict):
        return None
    inner = data.get("Data")
    rows = inner.get("ListDataTudoanh") if isinstance(inner, dict) else None
    if not isinstance(rows, list):
        return None
    valid = [r for r in rows if isinstance(r, dict) and r.get("Symbol")]
    if not valid:
        return None
    # Rows come newest-first, but pick by parsed date to be robust.
    latest = max(valid, key=lambda r: _iso_date(r.get("Date")) or "")
    sym = str(latest.get("Symbol") or "").upper()
    bv, sv = _f(latest.get("KLcpMua")), _f(latest.get("KlcpBan"))
    bval, sval = _f(latest.get("GtMua")), _f(latest.get("GtBan"))
    net_vol = (bv - sv) if bv is not None and sv is not None else None
    net_val = ((bval - sval) / _BILLION) if bval is not None and sval is not None else None
    return {
        "symbol": sym,
        "date": _iso_date(latest.get("Date")),
        "buy_vol": bv,
        "sell_vol": sv,
        "net_vol": net_vol,
        "buy_val": round(bval / _BILLION, 3) if bval is not None else None,   # tỷ VND
        "sell_val": round(sval / _BILLION, 3) if sval is not None else None,  # tỷ VND
        "net_val": round(net_val, 3) if net_val is not None else None,        # tỷ VND (>0 = mua ròng)
    }


async def _fetch_symbol(client: httpx.AsyncClient, symbol: str) -> object:
    resp = await client.get(
        _URL,
        params={
            "Symbol": symbol.upper(),
            "StartDate": "",
            "EndDate": "",
            "PageIndex": 1,
            "PageSize": _PAGE_SIZE,
        },
    )
    resp.raise_for_status()
    return resp.json()


_cache: dict[str, tuple[float, dict]] = {}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": _UA, "Referer": "https://cafef.vn/", "Accept": "application/json"},
    )


async def get_many(symbols: list[str]) -> dict[str, dict]:
    """Latest tự doanh flow for many symbols (bounded-concurrent GETs, best-effort → {}).

    Used to overlay prop-desk net onto the radar / movers. Also warms the per-symbol cache."""
    syms = [s.upper() for s in dict.fromkeys(s for s in symbols if s)][:_MAX_BATCH]
    if not syms:
        return {}
    sem = asyncio.Semaphore(_CONCURRENCY)
    out: dict[str, dict] = {}
    now = time.time()

    async with _client() as client:
        async def one(sym: str) -> None:
            async with sem:
                try:
                    parsed = parse_tudoanh(await _fetch_symbol(client, sym))
                except (httpx.HTTPError, ValueError) as exc:
                    logger.warning("[prop_trading] fetch %s failed — %s", sym, exc)
                    return
            if parsed:
                parsed["available"] = True
                out[sym] = parsed
                _cache[sym] = (now, parsed)

        await asyncio.gather(*(one(s) for s in syms))
    return out


async def get_symbol_prop(symbol: str, force: bool = False) -> dict:
    """Latest-session proprietary-desk (tự doanh) flow for a symbol (CafeF). TTL-cached."""
    sym = symbol.upper()
    now = time.time()
    hit = _cache.get(sym)
    if not force and hit and now - hit[0] < _TTL_SEC:
        return hit[1]
    try:
        async with _client() as client:
            parsed = parse_tudoanh(await _fetch_symbol(client, sym))
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[prop_trading] fetch %s failed — %s", sym, exc)
        return {"available": False, "symbol": sym, "note": "Chưa lấy được dữ liệu tự doanh."}
    if not parsed:
        return {"available": False, "symbol": sym, "note": "Không có dữ liệu tự doanh cho mã này."}
    parsed["available"] = True
    _cache[sym] = (now, parsed)
    return parsed
