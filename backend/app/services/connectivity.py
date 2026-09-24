"""Live reachability probes for the market-data sources (Settings → Data Sources).

Each source is hit with a short-timeout GET from wherever the backend runs, so the
UI can show whether VCI / TCBS are actually reachable (TCBS is geo-blocked outside
Vietnam — this is how the user sees that without reading logs).
"""
from __future__ import annotations

import asyncio
import time

import httpx

from app.config import get_settings

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_TIMEOUT = 6.0


async def _probe(
    client: httpx.AsyncClient, key: str, label: str, url: str
) -> dict:
    start = time.monotonic()
    try:
        resp = await client.get(url, headers={"User-Agent": _UA, "Accept": "*/*"})
        latency = int((time.monotonic() - start) * 1000)
        ok = resp.status_code < 400
        return {
            "key": key,
            "label": label,
            "host": httpx.URL(url).host,
            "status": "ok" if ok else "error",
            "http_status": resp.status_code,
            "latency_ms": latency,
            "detail": "Phản hồi bình thường" if ok else f"HTTP {resp.status_code} — bị chặn hoặc lỗi",
        }
    except (httpx.HTTPError, OSError) as exc:
        latency = int((time.monotonic() - start) * 1000)
        return {
            "key": key,
            "label": label,
            "host": httpx.URL(url).host,
            "status": "unreachable",
            "http_status": None,
            "latency_ms": latency,
            "detail": f"Không kết nối được ({type(exc).__name__})",
        }


async def probe_sources() -> list[dict]:
    """Concurrently probe each data source; never raises."""
    s = get_settings()
    vci_base = s.vci_trading_url.rsplit("/api", 1)[0]
    targets = [
        ("vci", "VCI (Vietcap)", f"{vci_base}/priceboard"),
        ("tcbs", "TCBS", f"{s.tcbs_base_url}/tcanalysis/v1/ticker/FPT/overview"),
    ]
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        return list(
            await asyncio.gather(*(_probe(client, k, lbl, url) for k, lbl, url in targets))
        )


async def probe_connectors() -> list[dict]:
    """Live reachability of the global-market connectors (terminal Connectors hub).

    Macro (FRED) needs a key: when unset we report ``not_configured`` without a
    network call rather than a misleading failure.
    """
    s = get_settings()
    wb_url = "https://api.worldbank.org/v2/country/VNM/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1&mrv=1"
    net_targets = [
        ("world", "Yahoo Finance", "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d"),
        ("fx", "Yahoo Finance (FX)", "https://query1.finance.yahoo.com/v8/finance/chart/VND=X?range=1d&interval=1d"),
        ("commodities", "Yahoo Finance (Futures)", "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=1d"),
        ("crypto", "CoinGecko", "https://api.coingecko.com/api/v3/ping"),
        ("worldbank", "World Bank", wb_url),
        ("asean", "World Bank", wb_url),
        ("dbnomics", "DBnomics", "https://api.db.nomics.world/v22/series/IMF/WEO:2025-04/VNM.NGDP_RPCH.pcent_change?observations=1"),
        ("news", "RSS (CafeF/CNBC…)", "https://cafef.vn/thi-truong-chung-khoan.rss"),
        ("foreign", "CafeF (khối ngoại)", "https://s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx?Symbol=&PageIndex=1&PageSize=1"),
    ]
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        results = list(
            await asyncio.gather(*(_probe(client, k, lbl, url) for k, lbl, url in net_targets))
        )
        if s.fred_api_key:
            results.append(
                await _probe(
                    client,
                    "macro",
                    "FRED",
                    f"https://api.stlouisfed.org/fred/series?series_id=DGS10&api_key={s.fred_api_key}&file_type=json",
                )
            )
        else:
            results.append(
                {
                    "key": "macro",
                    "label": "FRED",
                    "host": "api.stlouisfed.org",
                    "status": "not_configured",
                    "http_status": None,
                    "latency_ms": None,
                    "detail": "Cần FRED_API_KEY để bật",
                }
            )
    return results
