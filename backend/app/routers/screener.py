"""POST /screener/filter and saved-filter endpoints."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import FraudScore, SavedFilter, Stock, User
from app.routers.auth import get_current_user
from app.schemas.screener import SaveFilterRequest, ScreenerRequest
from app.schemas.stock import Envelope, StockResult
from app.services import compass, factors, highlights, nl_screener, signal_radar
from app.services.llm import LLMNotConfigured
from app.services.screener import run_screener
from app.services.stock_service import metrics_for_symbols

router = APIRouter(prefix="/screener", tags=["screener"])


@router.get("/fraud-scan", response_model=Envelope[list[dict]])
async def fraud_scan(
    flag: str = Query(default="high_risk"),
    db: AsyncSession = Depends(get_db),
) -> Envelope[list[dict]]:
    """Symbols carrying a given Beneish flag (e.g. high_risk) — for a screener filter."""
    rows = (
        await db.execute(
            select(FraudScore.symbol, FraudScore.beneish_mscore, FraudScore.beneish_flag,
                   FraudScore.altman_em_zone, FraudScore.piotroski_fscore, Stock.company_name)
            .join(Stock, Stock.symbol == FraudScore.symbol)
            .where(FraudScore.beneish_flag == flag)
            .order_by(FraudScore.beneish_mscore.desc().nullslast())
        )
    ).all()
    data = [
        {"symbol": r.symbol, "company_name": r.company_name, "beneish_mscore": r.beneish_mscore,
         "beneish_flag": r.beneish_flag, "altman_em_zone": r.altman_em_zone,
         "piotroski_fscore": r.piotroski_fscore}
        for r in rows
    ]
    return Envelope(data=data, meta={"flag": flag, "count": len(data)})


@router.get("/factors", response_model=Envelope[list[dict]])
async def factor_ranking(db: AsyncSession = Depends(get_db)) -> Envelope[list[dict]]:
    """Market-wide factor ranking (value/quality/growth + composite). Descriptive only."""
    data = await factors.get_factor_ranking(db)
    return Envelope(data=data, meta={"count": len(data)})


@router.get("/radar", response_model=Envelope[list[dict]])
async def signal_radar_endpoint(
    limit: int = Query(default=20, ge=1, le=40),
    with_news: bool = Query(default=True),
    overlays: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
) -> Envelope[list[dict]]:
    """Flagged stocks (forensic/QoE) + optional overlays — the risk radar.

    ``overlays=false`` returns the DB-only rows (forensic flags + sector valuation +
    coverage) INSTANTLY; the client then fetches the network overlays via /radar/flow so
    the table renders without waiting on foreign/tự doanh/news."""
    if overlays:
        data = await signal_radar.get_radar(db, limit=limit, with_news=with_news)
    else:
        data = await signal_radar.get_radar(
            db, limit=limit, with_news=False, with_foreign=False, with_prop=False,
            with_valuation=True,
        )
    coverage = await signal_radar.scan_coverage(db)
    return Envelope(data=data, meta={"count": len(data), "coverage": coverage})


@router.get("/radar/flow", response_model=Envelope[dict])
async def signal_radar_flow(
    symbols: str = Query(..., description="Comma-separated symbols"),
) -> Envelope[dict]:
    """Network overlays (foreign / tự doanh / news) for the radar's rows — the progressive
    second pass so the table renders instantly and these fill in after."""
    syms = [s.strip() for s in symbols.split(",") if s.strip()][:40]
    data = await signal_radar.get_flow_overlays(syms)
    return Envelope(data=data)


@router.get("/quality-picks", response_model=Envelope[dict])
async def quality_picks(db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    """\"Nền tảng vững\" — fundamentally-solid stocks (DB-only scan, no AI/live)."""
    return Envelope(data=await highlights.get_quality_picks(db))


@router.get("/compass-scores", response_model=Envelope[dict])
async def compass_scores(
    symbols: str = Query(..., description="Comma-separated tickers"),
    db: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    """Precomputed Compass scores for a batch of symbols (DB read, no AI)."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:500]
    data = await compass.get_scores_batch(db, syms)
    return Envelope(data=data)


@router.get("/compare", response_model=Envelope[list[StockResult]])
async def compare_symbols(
    symbols: str = Query(..., description="Comma-separated tickers to compare"),
    db: AsyncSession = Depends(get_db),
) -> Envelope[list[StockResult]]:
    """Latest metrics for an ad-hoc set of symbols (order preserved) — side-by-side compare."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:12]
    results = await metrics_for_symbols(db, syms)
    return Envelope(data=results, meta={"requested": len(syms), "found": len(results)})


class NlQuery(BaseModel):
    query: str = Field(min_length=1, max_length=300)


@router.post("/nl", response_model=Envelope[dict])
async def nl_filter(body: NlQuery, db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    """Turn a plain-language description into a validated screener filter (research-only)."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Mô tả trống.")
    try:
        flt = await nl_screener.build_filter(db, body.query)
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Lỗi gọi AI: {exc}") from exc
    return Envelope(data={"filter": flt})


@router.post("/filter", response_model=Envelope[list[StockResult]])
async def filter_stocks(
    req: ScreenerRequest, db: AsyncSession = Depends(get_db)
) -> Envelope[list[StockResult]]:
    results, matched, universe = await run_screener(db, req)
    return Envelope(
        data=results,
        meta={"total": universe, "filtered": matched, "limit": req.limit},
    )


@router.post("/save", response_model=Envelope[dict])
async def save_filter(
    req: SaveFilterRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    row = SavedFilter(
        name=req.name, criteria=req.criteria.model_dump(), user_id=user.id
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Envelope(data={"id": row.id, "name": row.name})


@router.get("/sectors", response_model=Envelope[list[str]])
async def list_sectors(db: AsyncSession = Depends(get_db)) -> Envelope[list[str]]:
    from app.models import Stock

    rows = (
        await db.execute(
            select(Stock.industry)
            .where(Stock.industry.is_not(None))
            .distinct()
            .order_by(Stock.industry)
        )
    ).scalars().all()
    return Envelope(data=[s for s in rows if s])


@router.get("/saved", response_model=Envelope[list[dict]])
async def list_saved(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[list[dict]]:
    rows = (
        await db.execute(select(SavedFilter).where(SavedFilter.user_id == user.id))
    ).scalars().all()
    return Envelope(
        data=[
            {"id": r.id, "name": r.name, "criteria": r.criteria} for r in rows
        ]
    )


@router.delete("/saved/{filter_id}", response_model=Envelope[dict])
async def delete_saved(
    filter_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Envelope[dict]:
    result = await db.execute(
        delete(SavedFilter).where(
            SavedFilter.id == filter_id, SavedFilter.user_id == user.id
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Saved screen not found")
    return Envelope(data={"id": filter_id, "deleted": True})
