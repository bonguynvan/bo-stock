"""DBnomics connector — IMF WEO macro for Vietnam (free, no API key).

DBnomics aggregates hundreds of public providers. We pull a small IMF World Economic
Outlook basket for Vietnam (GDP growth, inflation, unemployment, govt debt, current
account) — IMF's own estimates, complementing the World Bank historical series.

Research-only: latest value per series, ≤ the current year (WEO also carries multi-year
projections; we surface the newest estimate, not a far-out forecast). Pure
``parse_dbnomics_latest`` is unit-tested.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.dbnomics")

# IMF WEO release. Codes are per-release (~twice a year) — bump when a newer one
# exists; an invalid release just yields empty (graceful), never a crash.
_RELEASE = "WEO:2025-04"
_BASE = "https://api.db.nomics.world/v22/series/IMF/{release}/{series}"
_CACHE_TTL_SEC = 21600.0  # 6h


@dataclass(frozen=True)
class DbnSeries:
    code: str  # series code within the WEO release
    name: str
    unit: str


@dataclass(frozen=True)
class DbnObservation:
    period: str
    value: float


@dataclass(frozen=True)
class DbnPoint:
    code: str
    name: str
    unit: str
    value: float | None
    period: str | None


SERIES: tuple[DbnSeries, ...] = (
    DbnSeries("VNM.NGDP_RPCH.pcent_change", "Tăng trưởng GDP (IMF)", "%"),
    DbnSeries("VNM.PCPIPCH.pcent_change", "Lạm phát CPI (IMF)", "%"),
    DbnSeries("VNM.LUR.pcent_total_labor_force", "Thất nghiệp (IMF)", "%"),
    DbnSeries("VNM.GGXWDG_NGDP.pcent_gdp", "Nợ công / GDP", "%"),
    DbnSeries("VNM.BCA_NGDPD.pcent_gdp", "Cán cân vãng lai / GDP", "%"),
)


def _num(value: object) -> float | None:
    if value is None or value == "" or value == "NA":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def parse_dbnomics_latest(payload: object, max_period: int | None = None) -> DbnObservation | None:
    """DBnomics series response → newest numeric observation at period ≤ ``max_period``.

    The response nests ``series.docs[0]`` with aligned ``period``/``value`` arrays
    (ascending). WEO periods are 4-digit years. Returns ``None`` if unusable.
    """
    if not isinstance(payload, dict):
        return None
    docs = (payload.get("series") or {}).get("docs")
    if not isinstance(docs, list) or not docs:
        return None
    doc = docs[0] or {}
    periods = doc.get("period")
    values = doc.get("value")
    if not isinstance(periods, list) or not isinstance(values, list):
        return None

    best: DbnObservation | None = None
    for p, v in zip(periods, values):
        num = _num(v)
        if num is None:
            continue
        period = str(p)
        if max_period is not None:
            try:
                if int(period[:4]) > max_period:
                    continue
            except ValueError:
                pass
        best = DbnObservation(period=period, value=num)  # keep advancing → newest wins
    return best


_cache: dict[str, object] = {"at": 0.0, "points": []}


async def _fetch_series(client: httpx.AsyncClient, s: DbnSeries, max_period: int) -> DbnPoint:
    try:
        resp = await client.get(
            _BASE.format(release=_RELEASE, series=s.code), params={"observations": 1}
        )
        resp.raise_for_status()
        obs = parse_dbnomics_latest(resp.json(), max_period)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[dbnomics] %s failed — %s", s.code, exc)
        obs = None
    return DbnPoint(
        code=s.code,
        name=s.name,
        unit=s.unit,
        value=obs.value if obs else None,
        period=obs.period if obs else None,
    )


async def fetch_dbnomics(force: bool = False) -> list[DbnPoint]:
    now = time.time()
    cached = _cache["points"]
    if not force and cached and now - float(_cache["at"]) < _CACHE_TTL_SEC:
        return list(cached)  # type: ignore[arg-type]

    max_period = datetime.now(timezone.utc).year
    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout, headers={"Accept": "application/json"}
    ) as client:
        points = await asyncio.gather(*(_fetch_series(client, s, max_period) for s in SERIES))

    points = list(points)
    if any(p.value is not None for p in points):
        _cache["points"] = points
        _cache["at"] = now
    return points
