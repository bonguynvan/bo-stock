"""VCI (Vietcap) provider — the resilient primary source.

Reverse-engineered from the maintained ``vnstock`` library's VCI explorer:
- Listing : GET  https://trading.vietcap.com.vn/api/price/symbols/getAll
- Ratios  : GET  https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/{sym}/statistics-financial

The ratio endpoint returns "long" rows ``{item, item_id, "<period>": value, ...}``.
Because VCI exposes more than one ``item_id`` convention across versions, the
mapper matches each metric against a *set* of candidate codes so it survives code
churn. Like TCBS, vietcap is reachable mainly from Vietnam — validate the live
shape from a VN IP; the pure parsers below are tested independently.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, datetime, timezone

import httpx

from app.config import get_settings
from app.services.providers.base import FetchedMetrics, FetchedStock

logger = logging.getLogger("vnios.vci")

# Board codes from VCI getAll → our exchange labels.
_BOARD_MAP = {"HSX": "HOSE", "HOSE": "HOSE", "HNX": "HNX", "UPCOM": "UPCOM"}

# Fields VCI returns as fractions → convert to percent (keep heuristic so it is
# robust if VCI ever switches to percent: only scale when |v| <= 1.5).
_PERCENT_FIELDS = {"roe", "roa", "net_margin", "gross_margin", "dividend_yield"}
_BILLION = 1_000_000_000  # marketCap is absolute VND → tỷ VND


def _to_float(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def map_vci_listing(payload: list | dict) -> list[FetchedStock]:
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    out: list[FetchedStock] = []
    for r in rows or []:
        symbol = (r.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        if (r.get("type") or "STOCK").upper() != "STOCK":
            continue  # skip ETF / CW / bonds / futures
        board = (r.get("board") or r.get("exchange") or "").upper()
        out.append(
            FetchedStock(
                symbol=symbol,
                company_name=r.get("organShortName") or r.get("organName"),
                exchange=_BOARD_MAP.get(board, board or None),
                industry=None,  # getAll only carries icbCode2 (a code, not a name)
            )
        )
    return out


def _scale_percent(field: str, value: float | None) -> float | None:
    if value is None:
        return None
    if field in _PERCENT_FIELDS and abs(value) <= 1.5:
        return round(value * 100, 2)
    return value


def parse_vci_ratio(payload: list | dict, symbol: str) -> FetchedMetrics:
    """Parse VCI's wide-format ``statistics-financial`` response.

    ``data`` is a flat list of period records (``ratioType`` RATIO_TTM | RATIO_YEAR)
    with camelCase metric keys. We pick the newest trailing-twelve-month (TTM)
    record so the snapshot is current and comparable across companies.
    """
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    rows = [r for r in (rows or []) if r.get("pe") is not None or r.get("pb") is not None]
    if not rows:
        return FetchedMetrics(symbol=symbol)

    ttm = [r for r in rows if r.get("ratioType") == "RATIO_TTM"]
    pool = ttm or rows
    latest = max(
        pool,
        key=lambda r: (_to_float(r.get("yearReport")) or 0, _to_float(r.get("quarter")) or 0),
    )

    year = int(_to_float(latest.get("yearReport")) or 0)
    quarter = int(_to_float(latest.get("quarter")) or 0)
    rd = date(year, min(quarter * 3, 12) or 12, 1) if year else None

    mc = _to_float(latest.get("marketCap"))
    return FetchedMetrics(
        symbol=symbol,
        report_date=rd,
        period="quarterly" if quarter else "yearly",
        pe=_to_float(latest.get("pe")),
        pb=_to_float(latest.get("pb")),
        ev_ebitda=_to_float(latest.get("evToEbitda")),
        roe=_scale_percent("roe", _to_float(latest.get("roe"))),
        roa=_scale_percent("roa", _to_float(latest.get("roa"))),
        gross_margin=_scale_percent("gross_margin", _to_float(latest.get("grossMargin"))),
        net_margin=_scale_percent("net_margin", _to_float(latest.get("afterTaxProfitMargin"))),
        current_ratio=_to_float(latest.get("currentRatio")),
        debt_equity=_to_float(latest.get("debtToEquity")),
        dividend_yield=_scale_percent("dividend_yield", _to_float(latest.get("dividendYield"))),
        market_cap=int(mc / _BILLION) if mc else None,
    )


def parse_vci_ratio_history(payload: list | dict, symbol: str) -> list[dict]:
    """Extract the per-year ratio series from ``statistics-financial``.

    The same payload the snapshot parser reads also carries ~8 ``RATIO_YEAR``
    records (one per fiscal year). We keep the yearly ROE/ROA/margin/PE/PB series
    so Compass and Valuation can reason about a real ROE *trend* — at zero extra
    HTTP cost. Returned oldest→newest; percent fields scaled like the snapshot.
    """
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    years: dict[int, dict] = {}
    for r in rows or []:
        if r.get("ratioType") != "RATIO_YEAR":
            continue
        yr = _to_float(r.get("yearReport"))
        if not yr:
            continue
        year = int(yr)
        pe = _to_float(r.get("pe"))
        pb = _to_float(r.get("pb"))
        # Derive per-year EPS/BVPS exactly from the multiples: VCI carries no EPS/BVPS
        # field, but price = marketCap/shares, so eps = price/pe and bvps = price/pb.
        mc = _to_float(r.get("marketCap"))
        sh = _to_float(r.get("numberOfSharesMktCap"))
        price = mc / sh if mc and sh else None
        rec = {
            "year": year,
            "roe": _scale_percent("roe", _to_float(r.get("roe"))),
            "roa": _scale_percent("roa", _to_float(r.get("roa"))),
            "net_margin": _scale_percent(
                "net_margin", _to_float(r.get("afterTaxProfitMargin"))
            ),
            "gross_margin": _scale_percent("gross_margin", _to_float(r.get("grossMargin"))),
            "pe": pe,
            "pb": pb,
            "eps": round(price / pe) if price and pe and pe > 0 else None,
            "bvps": round(price / pb) if price and pb and pb > 0 else None,
            "dividend_yield": _scale_percent(
                "dividend_yield", _to_float(r.get("dividendYield"))
            ),
        }
        # Latest wins if a year repeats (defensive — VCI sends one per year).
        years[year] = rec
    return [years[y] for y in sorted(years)]


def parse_vci_details(payload: dict, symbol: str) -> dict:
    """Map ``company/details`` → enrichment fields (price, mcap, industry, name).

    Advisory fields (rating/targetPrice/projectedTSR) are intentionally ignored —
    research-only scope (see docs/DECISIONS.md).
    """
    d = payload.get("data", payload) if isinstance(payload, dict) else {}
    if not d:
        return {}
    mc = _to_float(d.get("marketCap"))
    return {
        "close_price": _to_float(d.get("currentPrice")),
        "market_cap": int(mc / _BILLION) if mc else None,
        "industry": d.get("sectorVn") or d.get("sector"),
        "company_name": d.get("viOrganShortName") or d.get("viOrganName"),
    }


# shareholder-structure fraction field → display label (Vietnamese).
# Only the distinct, non-overlapping holder lenses are shown — VCI also exposes
# institutionPercentage, which overlaps state/foreign, so it's excluded to avoid a
# misleading breakdown.
_OWNER_LABELS: tuple[tuple[str, str], ...] = (
    ("statePercentage", "Nhà nước"),
    ("foreignPercentage", "Nước ngoài"),
    ("bodPercentage", "Ban lãnh đạo"),
)


def parse_vci_ownership(payload: dict) -> list[dict]:
    """Map ``shareholder-structure`` fractions → [{name, pct}] (percent)."""
    d = payload.get("data", payload) if isinstance(payload, dict) else {}
    out: list[dict] = []
    for field, label in _OWNER_LABELS:
        v = _to_float(d.get(field))
        pct = round(v * 100, 2) if v is not None else 0.0
        if pct > 0:  # skip None / zero / rounding-to-zero
            out.append({"name": label, "pct": pct})
    return out


def parse_vci_ohlc(payload: list | dict) -> dict:
    """Last/prev close from gap-chart bars → {close_price, change_pct}."""
    rows = payload if isinstance(payload, list) else payload.get("data", [])
    if not rows:
        return {}
    closes = rows[0].get("c") or []
    if not closes:
        return {}
    last = _to_float(closes[-1])
    out: dict = {"close_price": last}
    if last is not None and len(closes) >= 2:
        prev = _to_float(closes[-2])
        if prev:
            out["change_pct"] = round((last - prev) / prev * 100, 2)
    return out


def parse_vci_ohlc_series(payload: list | dict) -> list[dict]:
    """gap-chart bars → [{time:'YYYY-MM-DD', open, high, low, close, volume}] (asc)."""
    rows = payload if isinstance(payload, list) else payload.get("data", [])
    if not rows:
        return []
    bar = rows[0]
    o, h, lo, c, v, t = (bar.get(k) or [] for k in ("o", "h", "l", "c", "v", "t"))
    n = min(len(o), len(h), len(lo), len(c), len(t))
    out: list[dict] = []
    for i in range(n):
        close = _to_float(c[i])
        if close is None:
            continue
        try:
            day = datetime.fromtimestamp(int(t[i]), tz=timezone.utc).strftime("%Y-%m-%d")
        except (TypeError, ValueError, OSError):
            continue
        out.append(
            {
                "time": day,
                "open": _to_float(o[i]),
                "high": _to_float(h[i]),
                "low": _to_float(lo[i]),
                "close": close,
                "volume": _to_float(v[i]) if i < len(v) else None,
            }
        )
    return out


def pick_profit_field(dict_payload: dict) -> str | None:
    """From the income-statement field dictionary, pick the net-profit code.

    Prefers profit *attributable to parent company* (headline net profit), then
    falls back to total net profit after tax. Title-based so it works per company
    type (banks/non-banks name their own codes)."""
    data = dict_payload.get("data", {}) if isinstance(dict_payload, dict) else {}
    items = data.get("INCOME_STATEMENT", []) if isinstance(data, dict) else []
    primary: str | None = None
    secondary: str | None = None
    for it in items:
        ten = (it.get("titleEn") or "").lower()
        tvi = (it.get("titleVi") or "").lower()
        field = it.get("field")
        if "attributable to parent" in ten or "cổ đông của công ty mẹ" in tvi:
            primary = primary or field
        elif ("profit" in ten and "after tax" in ten) or (
            "lợi nhuận" in tvi and "sau thuế" in tvi
        ):
            secondary = secondary or field
    return primary or secondary


def _pick_value(
    items: list,
    record: dict,
    primary_kw: tuple[str, ...],
    secondary_kw: tuple[str, ...] = (),
) -> float | None:
    """Resolve a line value by title (per-company), preferring primary keywords.

    Title-based so it works across company types (banks/non-banks use different
    codes but localized titles). Among matching lines that carry a non-zero value
    in ``record``, returns the largest — the headline total (e.g. 'Paid-in
    capital') rather than a zero sub-line ('…in wholly-owned subsidiaries') or a
    memo title whose code is absent from the statement data."""

    def collect(keywords: tuple[str, ...]) -> list[float]:
        vals: list[float] = []
        for it in items:
            t = ((it.get("titleVi") or "") + " " + (it.get("titleEn") or "")).lower()
            field = it.get("field")
            if field and any(k in t for k in keywords):
                v = _to_float(record.get(field))
                if v:  # skip None and 0
                    vals.append(v)
        return vals

    prim = collect(primary_kw)
    if prim:
        return max(prim, key=abs)
    sec = collect(secondary_kw) if secondary_kw else []
    return max(sec, key=abs) if sec else None


def parse_vci_balance_sheet(statement: dict, dictionary: dict) -> dict:
    """Charter capital + cash from the latest balance-sheet period (tỷ VND).

    Banks expose 'Charter capital'; non-banks 'Paid-in capital'. Cash matches only
    true cash-and-equivalents — bank vault-cash lines are intentionally not matched
    (→ cash stays null for banks rather than reporting a misleading figure)."""
    data = dictionary.get("data", {}) if isinstance(dictionary, dict) else {}
    items = data.get("BALANCE_SHEET", []) if isinstance(data, dict) else []

    sdata = statement.get("data", {}) if isinstance(statement, dict) else {}
    quarters = sdata.get("quarters", []) if isinstance(sdata, dict) else []
    if not quarters:
        return {}
    latest = max(
        quarters, key=lambda r: (r.get("yearReport") or 0, r.get("lengthReport") or 0)
    )

    charter = _pick_value(
        items, latest, ("charter capital", "vốn điều lệ"),
        ("paid-in capital", "share capital"),
    )
    cash = _pick_value(
        items, latest, ("cash and cash equivalent", "tiền và tương đương tiền")
    )

    out: dict = {}
    if charter:
        out["charter_capital"] = int(charter / _BILLION)
    if cash:
        out["cash"] = int(cash / _BILLION)
    return out


def parse_vci_income(statement: dict, dictionary: dict, n: int = 4) -> dict:
    """Build {quarterly_profit, profit_growth} from the income statement.

    quarterly_profit: last ``n`` quarters (oldest→newest) of net profit in tỷ VND.
    profit_growth: YoY % vs the same quarter a year earlier.
    """
    code = pick_profit_field(dictionary)
    data = statement.get("data", {}) if isinstance(statement, dict) else {}
    quarters = data.get("quarters", []) if isinstance(data, dict) else []
    if not code or not quarters:
        return {}

    srt = sorted(
        quarters,
        key=lambda r: (r.get("yearReport") or 0, r.get("lengthReport") or 0),
        reverse=True,
    )
    series: list[dict] = []
    for r in reversed(srt[:n]):  # oldest → newest for the chart
        val = _to_float(r.get(code))
        if val is None:
            continue
        yr = str(r.get("yearReport") or "")
        series.append(
            {"period": f"Q{r.get('lengthReport')} '{yr[2:]}", "value": round(val / _BILLION, 1)}
        )

    growth: float | None = None
    latest = srt[0]
    ly, lq = latest.get("yearReport"), latest.get("lengthReport")
    prior = next(
        (r for r in srt if r.get("yearReport") == (ly or 0) - 1 and r.get("lengthReport") == lq),
        None,
    )
    cv = _to_float(latest.get(code))
    pv = _to_float(prior.get(code)) if prior else None
    if cv is not None and pv:
        growth = round((cv - pv) / abs(pv) * 100, 2)
    return {"quarterly_profit": series, "profit_growth": growth}


class _RateLimiter:
    """Caps requests/sec across coroutines (VCI WAF throttles bursts)."""

    def __init__(self, per_sec: int) -> None:
        self._min_interval = 1.0 / max(1, per_sec)
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            wait = self._min_interval - (time.monotonic() - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()


class VCIProvider:
    name = "vci"

    def __init__(self) -> None:
        s = get_settings()
        self._trading = s.vci_trading_url.rstrip("/")
        self._iq = s.vci_iq_url.rstrip("/")
        self._timeout = s.http_timeout
        self._retries = s.http_max_retries
        self._limiter = _RateLimiter(s.http_rate_limit_per_sec)
        self._headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://trading.vietcap.com.vn/",
            "Origin": "https://trading.vietcap.com.vn",
        }
        # Lazily-created shared client; handshake runs once per instance.
        self._client: httpx.AsyncClient | None = None
        self._ready = False
        self._init_lock = asyncio.Lock()

    async def _ensure(self) -> httpx.AsyncClient:
        async with self._init_lock:
            if self._client is None:
                self._client = httpx.AsyncClient(
                    headers=self._headers, follow_redirects=True, timeout=self._timeout
                )
            if not self._ready:
                try:
                    await self._client.get("https://trading.vietcap.com.vn/priceboard")
                except Exception as exc:  # noqa: BLE001 - handshake is best-effort
                    logger.warning("[WARN] VCI handshake failed — %s", exc)
                self._ready = True
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            self._ready = False

    async def _get_json(self, url: str) -> dict | list:
        client = await self._ensure()
        last: Exception | None = None
        for attempt in range(1, self._retries + 1):
            await self._limiter.acquire()
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001
                last = exc
                logger.warning("[RETRY %d/%d] %s — %s", attempt, self._retries, url, exc)
        raise RuntimeError(f"VCI request failed: {url}") from last

    async def _post_json(self, url: str, payload: dict) -> dict | list:
        client = await self._ensure()
        last: Exception | None = None
        for attempt in range(1, self._retries + 1):
            await self._limiter.acquire()
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:  # noqa: BLE001
                last = exc
                logger.warning("[RETRY %d/%d] POST %s — %s", attempt, self._retries, url, exc)
        raise RuntimeError(f"VCI POST failed: {url}") from last

    async def fetch_stock_list(self) -> list[FetchedStock]:
        payload = await self._get_json(f"{self._trading}/price/symbols/getAll")
        return map_vci_listing(payload)

    async def fetch_stock_metrics(
        self, symbol: str, with_ohlc: bool = True
    ) -> FetchedMetrics:
        symbol = symbol.upper()
        ratio = await self._get_json(
            f"{self._iq}/v1/company/{symbol}/statistics-financial"
        )
        m = parse_vci_ratio(ratio, symbol)
        # Free ride: the same payload carries the yearly ROE series.
        m.ratio_history = parse_vci_ratio_history(ratio, symbol)
        # Enrich with price / industry / name / market cap (ratio lacks these).
        try:
            details = await self._get_json(
                f"{self._iq}/v1/company/details?ticker={symbol}"
            )
            enrich = parse_vci_details(details, symbol)  # type: ignore[arg-type]
            m.close_price = enrich.get("close_price") or m.close_price
            m.industry = enrich.get("industry") or m.industry
            m.company_name = enrich.get("company_name") or m.company_name
            if enrich.get("market_cap"):
                m.market_cap = enrich["market_cap"]
        except Exception as exc:  # noqa: BLE001 - enrichment is best-effort
            logger.warning("[WARN] %s details unavailable — %s", symbol, exc)

        # Day change from the last two daily closes (skipped in bulk syncs —
        # day-change is a daily price concern, not a quarterly fundamentals one).
        if with_ohlc:
            try:
                ohlc = await self._post_json(
                    f"{self._trading}/chart/OHLCChart/gap-chart",
                    {"timeFrame": "ONE_DAY", "symbols": [symbol], "to": int(time.time()),
                     "countBack": 2},
                )
                px = parse_vci_ohlc(ohlc)  # type: ignore[arg-type]
                if px.get("close_price"):
                    m.close_price = px["close_price"]
                if px.get("change_pct") is not None:
                    m.change_pct = px["change_pct"]
            except Exception as exc:  # noqa: BLE001 - day change is best-effort
                logger.warning("[WARN] %s OHLC unavailable — %s", symbol, exc)

        # Derive trailing EPS from price / P/E (VCI ratio has no EPS field).
        if m.close_price and m.pe and m.pe > 0:
            m.eps_trailing = round(m.close_price / m.pe, 1)
        return m

    async def fetch_ownership(self, symbol: str) -> list[dict]:
        symbol = symbol.upper()
        payload = await self._get_json(
            f"{self._iq}/v1/company/{symbol}/shareholder-structure"
        )
        return parse_vci_ownership(payload)  # type: ignore[arg-type]

    async def fetch_ohlc(self, symbol: str, count: int = 120) -> list[dict]:
        """Daily OHLC bars (most recent ``count``) for the price chart."""
        payload = await self._post_json(
            f"{self._trading}/chart/OHLCChart/gap-chart",
            {"timeFrame": "ONE_DAY", "symbols": [symbol.upper()],
             "to": int(time.time()), "countBack": count},
        )
        return parse_vci_ohlc_series(payload)  # type: ignore[arg-type]

    async def fetch_fundamentals(self, symbol: str) -> dict:
        """Detail-panel fundamentals: Q/Q net-profit series + YoY growth, plus
        charter capital + cash. One dictionary call covers all statement sections."""
        symbol = symbol.upper()
        diction = await self._get_json(
            f"{self._iq}/v1/company/{symbol}/financial-statement/metrics?section=INCOME_STATEMENT"
        )
        income = await self._get_json(
            f"{self._iq}/v1/company/{symbol}/financial-statement?section=INCOME_STATEMENT"
        )
        out = parse_vci_income(income, diction)  # type: ignore[arg-type]
        try:
            balance = await self._get_json(
                f"{self._iq}/v1/company/{symbol}/financial-statement?section=BALANCE_SHEET"
            )
            out.update(parse_vci_balance_sheet(balance, diction))  # type: ignore[arg-type]
        except Exception as exc:  # noqa: BLE001 - balance sheet is best-effort
            logger.warning("[WARN] %s balance sheet unavailable — %s", symbol, exc)
        return out
