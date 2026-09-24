"""World Bank connector — country macro indicators (free, no API key).

Fincept-style aggregation of a reliable free/public source. Country-level macro
context for Vietnam (GDP growth, inflation, unemployment, trade, FDI). Research-only:
latest reported value per indicator. Pure ``parse_worldbank_latest`` is unit-tested.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.worldbank")

_BASE = "https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
_COUNTRY = "VNM"  # Vietnam
_CACHE_TTL_SEC = 21600.0  # 6h — WB updates at most a few times a year


@dataclass(frozen=True)
class WbSeries:
    indicator: str
    name: str
    unit: str


@dataclass(frozen=True)
class WbObservation:
    date: str
    value: float


@dataclass(frozen=True)
class WbPoint:
    indicator: str
    name: str
    unit: str
    value: float | None
    date: str | None


# Vietnam macro context.
SERIES: tuple[WbSeries, ...] = (
    WbSeries("NY.GDP.MKTP.KD.ZG", "Tăng trưởng GDP", "%"),
    WbSeries("FP.CPI.TOTL.ZG", "Lạm phát (CPI)", "%"),
    WbSeries("SL.UEM.TOTL.ZS", "Thất nghiệp", "%"),
    WbSeries("NE.EXP.GNFS.ZS", "Xuất khẩu / GDP", "%"),
    WbSeries("BX.KLT.DINV.WD.GD.ZS", "FDI ròng / GDP", "%"),
)

# Vietnam vs ASEAN peers on GDP growth (context — how VN stacks up regionally).
_GDP_GROWTH = "NY.GDP.MKTP.KD.ZG"
ASEAN: tuple[tuple[str, str], ...] = (
    ("VNM", "Việt Nam"),
    ("THA", "Thái Lan"),
    ("IDN", "Indonesia"),
    ("PHL", "Philippines"),
    ("MYS", "Malaysia"),
    ("SGP", "Singapore"),
)


@dataclass(frozen=True)
class CountryPoint:
    country: str
    name: str
    value: float | None
    date: str | None


def rank_country_points(points: list[CountryPoint]) -> list[CountryPoint]:
    """Sort by GDP growth high→low; countries with no value sink to the bottom."""
    return sorted(points, key=lambda p: (p.value is not None, p.value or 0), reverse=True)


def _num(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_worldbank_latest(payload: object) -> WbObservation | None:
    """World Bank ``[meta, observations]`` → newest observation with a real value.

    WB returns observations newest-first; recent years are often ``null`` until
    reported, so we scan forward for the first non-null value. Returns ``None`` on
    an error payload (a 1-element list) or when every value is null.
    """
    if not isinstance(payload, list) or len(payload) < 2:
        return None
    observations = payload[1]
    if not isinstance(observations, list) or not observations:
        return None
    for row in observations:
        if not isinstance(row, dict):
            continue
        value = _num(row.get("value"))
        if value is None:
            continue
        return WbObservation(date=str(row.get("date") or ""), value=value)
    return None


_cache: dict[str, object] = {"at": 0.0, "points": []}


async def _fetch_series(client: httpx.AsyncClient, s: WbSeries) -> WbPoint:
    try:
        resp = await client.get(
            _BASE.format(country=_COUNTRY, indicator=s.indicator),
            params={"format": "json", "per_page": 10, "mrv": 5},
        )
        resp.raise_for_status()
        obs = parse_worldbank_latest(resp.json())
    except Exception as exc:  # noqa: BLE001
        logger.warning("[worldbank] %s failed — %s", s.indicator, exc)
        obs = None
    return WbPoint(
        indicator=s.indicator,
        name=s.name,
        unit=s.unit,
        value=obs.value if obs else None,
        date=obs.date if obs else None,
    )


async def fetch_worldbank(force: bool = False) -> list[WbPoint]:
    now = time.time()
    cached = _cache["points"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout, headers={"Accept": "application/json"}
    ) as client:
        points = await asyncio.gather(*(_fetch_series(client, s) for s in SERIES))

    points = list(points)
    if any(p.value is not None for p in points):
        _cache["points"] = points
        _cache["at"] = now
    return points


_asean_cache: dict[str, object] = {"at": 0.0, "points": []}


async def _fetch_country_gdp(client: httpx.AsyncClient, iso: str, name: str) -> CountryPoint:
    try:
        resp = await client.get(
            _BASE.format(country=iso, indicator=_GDP_GROWTH),
            params={"format": "json", "per_page": 10, "mrv": 5},
        )
        resp.raise_for_status()
        obs = parse_worldbank_latest(resp.json())
    except Exception as exc:  # noqa: BLE001
        logger.warning("[worldbank] ASEAN %s failed — %s", iso, exc)
        obs = None
    return CountryPoint(
        country=iso,
        name=name,
        value=obs.value if obs else None,
        date=obs.date if obs else None,
    )


async def fetch_asean_gdp(force: bool = False) -> list[CountryPoint]:
    """Latest GDP-growth per ASEAN country (VN vs peers), sorted high→low."""
    now = time.time()
    cached = _asean_cache["points"]
    if not force and cached and now - float(_asean_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout, headers={"Accept": "application/json"}
    ) as client:
        points = await asyncio.gather(
            *(_fetch_country_gdp(client, iso, name) for iso, name in ASEAN)
        )

    ranked = rank_country_points(list(points))
    if any(p.value is not None for p in ranked):
        _asean_cache["points"] = ranked
        _asean_cache["at"] = now
    return ranked
