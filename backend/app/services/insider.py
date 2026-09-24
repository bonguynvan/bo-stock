"""Per-stock insider transactions (giao dịch nội bộ) via the VCI iq-insight service.

VCI's ``company/{sym}/insider-transaction`` returns filed insider deals: who (name +
board/exec position), buy/sell/bonus, registered vs actually-transacted shares, and the
resulting ownership. ``shareAcquire`` is SIGNED (Mua = +, Bán = −), so summing completed
deals over a window gives a net insider direction — a corroborating signal (insiders
net-selling a forensically-flagged name is a stronger risk). Reachable from our primary
(no geo-block, unlike TCBS), so no headless render needed.

Pure ``parse_insider`` / ``summarize_insider`` are unit-tested; the fetch does the VCI WAF
handshake + GET and is TTL-cached. Research-only, descriptive — no advice.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.insider")

_HANDSHAKE = "https://trading.vietcap.com.vn/priceboard"
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
_TTL_SEC = 1800.0  # 30 min — filings change slowly
_RECENT_CAP = 25  # deals returned to the UI
_SUMMARY_WINDOW_DAYS = 180  # net-direction lookback


def _f(v: object) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _iso_date(v: object) -> str | None:
    """VCI ISO datetime (``2026-06-05T00:00:00``) → date ``2026-06-05``."""
    if not isinstance(v, str) or len(v) < 10:
        return None
    d = v[:10]
    return d if d[4] == "-" and d[7] == "-" else None


def _status(vi: object) -> str:
    """Normalize tradeStatus → 'done' | 'registered' | 'other'."""
    t = (vi or "") if isinstance(vi, str) else ""
    tl = t.lower()
    if "xong" in tl:  # "Đã thực hiện xong"
        return "done"
    if "ký" in tl:  # "Đăng ký"
        return "registered"
    return "other"


def parse_insider(payload: object) -> list[dict]:
    """VCI insider-transaction response → normalized deals (newest publicDate first).

    ``transacted_shares`` keeps VCI's sign (Mua = +, Bán = −); ``ownership_after_pct`` is
    scaled to percent. Tolerant of missing fields and non-dict payloads (→ [])."""
    if not isinstance(payload, dict):
        return []
    content = ((payload.get("data") or {}).get("content")) if isinstance(payload.get("data"), dict) else None
    if not isinstance(content, list):
        return []
    out: list[dict] = []
    for r in content:
        if not isinstance(r, dict):
            continue
        own = _f(r.get("ownershipAfterTrade"))
        out.append({
            "public_date": _iso_date(r.get("publicDate")),
            "start_date": _iso_date(r.get("startDate")),
            "end_date": _iso_date(r.get("endDate")),
            "trader": r.get("traderNameVi"),
            "position": r.get("traderPositionVi"),
            "action": r.get("actionTypeVi"),         # Mua | Bán | Thưởng
            "action_code": r.get("actionTypeCode"),   # B | S | ...
            "status": _status(r.get("tradeStatusVi")),
            "register_shares": _f(r.get("shareRegister")),
            "transacted_shares": _f(r.get("shareAcquire")),  # signed
            "ownership_after_pct": round(own * 100, 4) if own is not None else None,
            "event_code": r.get("eventCode"),
            "source_url": r.get("sourceUrlVi") or None,
        })
    out.sort(key=lambda d: d.get("public_date") or "", reverse=True)
    return out


def summarize_insider(
    deals: list[dict], now: datetime | None = None, window_days: int = _SUMMARY_WINDOW_DAYS
) -> dict:
    """Net insider direction over the last ``window_days`` (completed Mua/Bán only).

    ``net_shares`` = Σ signed transacted shares (>0 = insiders net buying). Bonus (Thưởng)
    and still-registered filings are excluded — they aren't discretionary market trades."""
    now = now or datetime.now()
    cutoff = (now - timedelta(days=window_days)).date().isoformat()
    net = 0.0
    buy = sell = 0
    for d in deals:
        if d.get("status") != "done" or d.get("action") not in ("Mua", "Bán"):
            continue
        if (d.get("public_date") or "") < cutoff:
            continue
        qty = d.get("transacted_shares")
        if qty is None:
            continue
        net += qty
        if qty > 0:
            buy += 1
        elif qty < 0:
            sell += 1
    direction = "buy" if net > 0 else "sell" if net < 0 else "neutral"
    return {
        "window_days": window_days,
        "net_shares": round(net),
        "buy_count": buy,
        "sell_count": sell,
        "direction": direction,
    }


async def _fetch(symbol: str) -> object:
    base = get_settings().vci_iq_url.rstrip("/")
    url = f"{base}/v1/company/{symbol.upper()}/insider-transaction"
    async with httpx.AsyncClient(
        timeout=15.0, follow_redirects=True,
        headers={"User-Agent": _UA, "Referer": "https://trading.vietcap.com.vn/",
                 "Accept": "application/json"},
    ) as client:
        try:
            await client.get(_HANDSHAKE)  # warm the WAF (best-effort)
        except httpx.HTTPError:
            pass
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


_cache: dict[str, tuple[float, dict]] = {}


async def get_insider(symbol: str, force: bool = False) -> dict:
    """Filed insider transactions for a symbol (VCI) + a net-direction summary. TTL-cached."""
    sym = symbol.upper()
    now = time.time()
    hit = _cache.get(sym)
    if not force and hit and now - hit[0] < _TTL_SEC:
        return hit[1]
    try:
        deals = parse_insider(await _fetch(sym))
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[insider] fetch %s failed — %s", sym, exc)
        return {"available": False, "symbol": sym, "note": "Chưa lấy được dữ liệu giao dịch nội bộ."}
    if not deals:
        return {"available": False, "symbol": sym,
                "note": "Không có dữ liệu giao dịch nội bộ cho mã này."}
    data = {
        "available": True,
        "symbol": sym,
        "count": len(deals),
        "summary": summarize_insider(deals),
        "deals": deals[:_RECENT_CAP],
    }
    _cache[sym] = (now, data)
    return data
