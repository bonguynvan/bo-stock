"""Meta endpoints: data freshness / sync status + data-source connectivity."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Stock, StockMetric
from app.schemas.stock import Envelope
from app.services import connectivity, macro, sectors
from app.services.providers import (
    available_providers,
    current_provider_name,
    set_provider_override,
)

router = APIRouter(prefix="/meta", tags=["meta"])


class ProviderSwitch(BaseModel):
    provider: str


@router.get("/sync-status", response_model=Envelope[dict])
async def sync_status(db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    last_update = (
        await db.execute(select(func.max(StockMetric.created_at)))
    ).scalar_one_or_none()
    symbols_with_metrics = (
        await db.execute(select(func.count(func.distinct(StockMetric.symbol))))
    ).scalar_one()
    total_stocks = (await db.execute(select(func.count(Stock.symbol)))).scalar_one()
    return Envelope(
        data={
            "last_update": last_update.isoformat() if last_update else None,
            "symbols_with_metrics": symbols_with_metrics,
            "total_stocks": total_stocks,
        }
    )


@router.get("/sectors", response_model=Envelope[dict])
async def sectors_overview(db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    """Per-industry aggregates (count, market cap, median PE/PB/ROE/margin)."""
    return Envelope(data=await sectors.get_sectors_overview(db))


@router.get("/providers", response_model=Envelope[dict])
async def providers_status() -> Envelope[dict]:
    """Active provider + live reachability of each data source."""
    sources = await connectivity.probe_sources()
    return Envelope(
        data={
            "current": current_provider_name(),
            "default": get_settings().data_provider.lower(),
            "options": available_providers(),
            "sources": sources,
        }
    )


@router.get("/connectors", response_model=Envelope[list])
async def connectors() -> Envelope[list]:
    """Global-market connectors (Fincept-style) and their configuration status.

    VN equity metrics come from the provider chain (see ``/meta/providers``); these
    are the *global context* sources aggregated for the terminal dashboard.
    """
    items = [
        {
            "key": "world",
            "label": "Thị trường thế giới",
            "source": "Yahoo Finance",
            "domain": "Chỉ số / hàng hóa / crypto",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "fx",
            "label": "Ngoại hối (FX)",
            "source": "Yahoo Finance",
            "domain": "Tỷ giá USD/VND, EUR/USD…",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "commodities",
            "label": "Hàng hóa",
            "source": "Yahoo Finance",
            "domain": "Kim loại / năng lượng / khí",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "crypto",
            "label": "Crypto",
            "source": "CoinGecko",
            "domain": "Giá + vốn hóa 24h",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "macro",
            "label": "Vĩ mô toàn cầu",
            "source": "FRED",
            "domain": "Lãi suất / lạm phát / VIX / dầu",
            "requires_key": True,
            "configured": macro.macro_configured(),
        },
        {
            "key": "worldbank",
            "label": "Vĩ mô Việt Nam",
            "source": "World Bank",
            "domain": "GDP / lạm phát / thất nghiệp (VN)",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "asean",
            "label": "So sánh ASEAN",
            "source": "World Bank",
            "domain": "GDP: VN vs ASEAN",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "dbnomics",
            "label": "IMF WEO (DBnomics)",
            "source": "DBnomics",
            "domain": "Vĩ mô VN: GDP/CPI/nợ công (IMF)",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "foreign",
            "label": "Khối ngoại",
            "source": "CafeF",
            "domain": "Mua/bán ròng khối ngoại (VN)",
            "requires_key": False,
            "configured": True,
        },
        {
            "key": "news",
            "label": "Tin tức (RSS)",
            "source": "CafeF / Vietstock / CNBC…",
            "domain": "Tin VN + thế giới + vĩ mô",
            "requires_key": False,
            "configured": True,
        },
    ]
    return Envelope(data=items, meta={"count": len(items)})


@router.get("/connectors/health", response_model=Envelope[list])
async def connectors_health() -> Envelope[list]:
    """Live reachability probe of each global-market connector (status + latency)."""
    sources = await connectivity.probe_connectors()
    return Envelope(data=sources, meta={"count": len(sources)})


@router.post("/provider", response_model=Envelope[dict])
async def switch_provider(body: ProviderSwitch) -> Envelope[dict]:
    """Switch the active provider at runtime (resets to .env on restart)."""
    try:
        current = set_provider_override(body.provider)
    except ValueError as exc:
        return Envelope(success=False, error=str(exc))
    return Envelope(data={"current": current})
