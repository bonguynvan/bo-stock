"""Macro connector — FRED (Federal Reserve Bank of St. Louis) series.

Fincept-style aggregation of a freemium source: FRED is free but requires a
user-supplied API key (``FRED_API_KEY``). Without it, the panel degrades gracefully
(empty + a note), mirroring the LLM/document flow. Research-only: latest observation
per series, no advice. Pure ``parse_fred_latest`` is unit-tested.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.macro")

_OBS_URL = "https://api.stlouisfed.org/fred/series/observations"
_CACHE_TTL_SEC = 3600.0  # macro series move slowly (daily at most)


@dataclass(frozen=True)
class MacroSeries:
    series_id: str
    name: str
    unit: str


@dataclass(frozen=True)
class MacroObservation:
    date: str
    value: float


@dataclass(frozen=True)
class MacroPoint:
    series_id: str
    name: str
    unit: str
    value: float | None
    date: str | None


# Global macro context relevant to a VN equity researcher.
SERIES: tuple[MacroSeries, ...] = (
    MacroSeries("DGS10", "Lợi suất TPCP Mỹ 10 năm", "%"),
    MacroSeries("FEDFUNDS", "Lãi suất Fed Funds", "%"),
    MacroSeries("UNRATE", "Thất nghiệp Mỹ", "%"),
    MacroSeries("VIXCLS", "VIX (biến động)", "index"),
    MacroSeries("DCOILBRENTEU", "Dầu Brent", "USD/thùng"),
    MacroSeries("DTWEXBGS", "Chỉ số USD (rộng)", "index"),
)


def parse_fred_latest(payload: object) -> MacroObservation | None:
    """Return the most recent observation whose value is not FRED's ``"."`` sentinel.

    FRED returns observations ascending by date; missing values are encoded as ``"."``.
    We scan from the newest backward for the first real number.
    """
    if not isinstance(payload, dict):
        return None
    obs = payload.get("observations")
    if not isinstance(obs, list) or not obs:
        return None
    for row in reversed(obs):
        if not isinstance(row, dict):
            continue
        raw = row.get("value")
        if raw in (None, "", "."):
            continue
        try:
            value = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        return MacroObservation(date=str(row.get("date") or ""), value=value)
    return None


_cache: dict[str, object] = {"at": 0.0, "points": []}


def macro_configured() -> bool:
    return bool(get_settings().fred_api_key)


async def _fetch_series(client: httpx.AsyncClient, s: MacroSeries, api_key: str) -> MacroPoint:
    try:
        resp = await client.get(
            _OBS_URL,
            params={
                "series_id": s.series_id,
                "api_key": api_key,
                "file_type": "json",
                "sort_order": "asc",
                "limit": 60,  # last ~60 points; we take the newest real one
            },
        )
        resp.raise_for_status()
        obs = parse_fred_latest(resp.json())
    except Exception as exc:  # noqa: BLE001
        logger.warning("[macro] %s failed — %s", s.series_id, exc)
        obs = None
    return MacroPoint(
        series_id=s.series_id,
        name=s.name,
        unit=s.unit,
        value=obs.value if obs else None,
        date=obs.date if obs else None,
    )


async def fetch_macro(force: bool = False) -> list[MacroPoint]:
    """Latest value per configured FRED series. Empty list when no API key is set."""
    settings = get_settings()
    api_key = settings.fred_api_key
    if not api_key:
        return []

    now = time.time()
    cached = _cache["points"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    async with httpx.AsyncClient(
        timeout=settings.http_timeout, headers={"Accept": "application/json"}
    ) as client:
        points = await asyncio.gather(*(_fetch_series(client, s, api_key) for s in SERIES))

    points = list(points)
    if any(p.value is not None for p in points):
        _cache["points"] = points
        _cache["at"] = now
    return points
