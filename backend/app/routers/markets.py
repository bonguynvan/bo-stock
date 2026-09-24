"""Global-markets endpoints — Fincept-style multi-source context for the terminal.

Research-only: neutral last-price + day-change for world indices, commodities, FX and
crypto. Sourced from a free/public provider (Yahoo Finance); see ``world_markets``.
"""
from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.stock import Envelope
from app.services import (
    commodities,
    crypto,
    dbnomics,
    foreign_flow,
    forex,
    index_data,
    macro,
    movers,
    world_markets,
    worldbank,
)

router = APIRouter(prefix="/markets", tags=["markets"])


@router.get("/foreign", response_model=Envelope[dict])
async def foreign_summary(force: bool = False) -> Envelope[dict]:
    """Market-level foreign (khối ngoại) buy/sell/net for the latest day (CafeF, cached)."""
    return Envelope(data=await foreign_flow.fetch_foreign_summary(force=force))


@router.get("/movers", response_model=Envelope[dict])
async def movers_pulse(db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    """VN market pulse: gainers / losers / most-active + breadth (from latest metrics)."""
    return Envelope(data=await movers.get_movers(db))


@router.get("/vn-indices", response_model=Envelope[list])
async def vn_indices(db: AsyncSession = Depends(get_db)) -> Envelope[list]:
    """Latest VN index levels + day change (VN-Index/VN30/HNX) from synced bars.

    Reads persisted ``IndexBar`` data; returns an empty list if indices are not yet
    synced (the UI then shows nothing rather than stale/fake numbers).
    """
    out: list[dict] = []
    for sym, name in index_data.INDICES:
        summary = await index_data.index_summary(db, sym)
        if summary:
            out.append(
                {
                    "symbol": summary["symbol"],
                    "name": name,
                    "level": summary["level"],
                    "change_pct": summary["change_pct"],
                    "as_of": summary["as_of"],
                }
            )
    return Envelope(data=out, meta={"count": len(out)})


@router.get("/world", response_model=Envelope[list])
async def world(force: bool = False) -> Envelope[list]:
    """World indices / commodities / FX / crypto snapshot (cached ~60s)."""
    quotes = await world_markets.fetch_world_markets(force=force)
    return Envelope(
        data=[asdict(q) for q in quotes],
        meta={"count": len(quotes), "source": "yahoo"},
    )


@router.get("/crypto", response_model=Envelope[list])
async def crypto_markets(force: bool = False) -> Envelope[list]:
    """Crypto basket (last price + 24h change + market cap) from CoinGecko."""
    quotes = await crypto.fetch_crypto_markets(force=force)
    return Envelope(
        data=[asdict(q) for q in quotes],
        meta={"count": len(quotes), "source": "coingecko"},
    )


@router.get("/fx", response_model=Envelope[list])
async def fx_markets(force: bool = False) -> Envelope[list]:
    """Major FX pairs (USD/VND first) — last rate + day change, from Yahoo."""
    quotes = await forex.fetch_forex(force=force)
    return Envelope(
        data=[asdict(q) for q in quotes],
        meta={"count": len(quotes), "source": "yahoo"},
    )


@router.get("/commodities", response_model=Envelope[list])
async def commodities_markets(force: bool = False) -> Envelope[list]:
    """Commodities basket (metals + energy + gas) — last price + day change, Yahoo."""
    quotes = await commodities.fetch_commodities(force=force)
    return Envelope(
        data=[asdict(q) for q in quotes],
        meta={"count": len(quotes), "source": "yahoo"},
    )


@router.get("/worldbank", response_model=Envelope[list])
async def worldbank_series(force: bool = False) -> Envelope[list]:
    """Vietnam country macro (GDP growth, inflation, unemployment…) from World Bank."""
    points = await worldbank.fetch_worldbank(force=force)
    return Envelope(
        data=[asdict(p) for p in points],
        meta={"count": len(points), "source": "worldbank", "country": "VNM"},
    )


@router.get("/dbnomics", response_model=Envelope[list])
async def dbnomics_series(force: bool = False) -> Envelope[list]:
    """Vietnam IMF-WEO macro (GDP/inflation/unemployment/debt/current account) via DBnomics."""
    points = await dbnomics.fetch_dbnomics(force=force)
    return Envelope(
        data=[asdict(p) for p in points],
        meta={"count": len(points), "source": "dbnomics", "release": dbnomics._RELEASE},
    )


@router.get("/asean", response_model=Envelope[list])
async def asean_gdp(force: bool = False) -> Envelope[list]:
    """Vietnam vs ASEAN peers on GDP growth (latest), from World Bank."""
    points = await worldbank.fetch_asean_gdp(force=force)
    return Envelope(
        data=[asdict(p) for p in points],
        meta={"count": len(points), "source": "worldbank", "indicator": "GDP growth %"},
    )


@router.get("/macro", response_model=Envelope[list])
async def macro_series(force: bool = False) -> Envelope[list]:
    """Global macro series (latest value) from FRED. Empty unless FRED_API_KEY is set."""
    points = await macro.fetch_macro(force=force)
    return Envelope(
        data=[asdict(p) for p in points],
        meta={
            "count": len(points),
            "source": "fred",
            "configured": macro.macro_configured(),
            "note": None if macro.macro_configured() else "Cần FRED_API_KEY để bật dữ liệu vĩ mô.",
        },
    )
