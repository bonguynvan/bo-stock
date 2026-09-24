"""GET /stocks and GET /stocks/{symbol}."""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.document import ResearchQuestion
from app.schemas.stock import Envelope, OhlcBar, StockDetail, StockResult
from app.schemas.valuation import ValuationDcfBody
from app.services import (
    compass,
    conviction,
    foreign_stock,
    fraud_api,
    insider,
    news_signals,
    peers,
    prop_trading,
    backtest,
    lenses,
    report_pdf,
    research_search,
    stock_service,
    technicals,
    valuation,
)
from app.services.llm import AnalysisParseError, LLMNotConfigured

logger = logging.getLogger("vnios.stocks")
router = APIRouter(prefix="/stocks", tags=["stocks"])


class ResearchRequest(BaseModel):
    questions: list[ResearchQuestion] = []


@router.get("", response_model=Envelope[list[StockResult]])
async def list_stocks(
    exchange: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> Envelope[list[StockResult]]:
    results, total = await stock_service.list_stocks(
        db, exchange=exchange, industry=industry, limit=limit, offset=offset
    )
    return Envelope(
        data=results, meta={"total": total, "limit": limit, "offset": offset}
    )


@router.get("/{symbol}", response_model=Envelope[StockDetail])
async def get_stock(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[StockDetail]:
    detail = await stock_service.get_stock_detail(db, symbol)
    if detail is None:
        return Envelope(success=False, error=f"Stock '{symbol.upper()}' not found")
    return Envelope(data=detail)


@router.get("/{symbol}/report.pdf")
async def stock_report_pdf(symbol: str, db: AsyncSession = Depends(get_db)) -> Response:
    """Render the V-Investment OS research report for a stock as a PDF download."""
    detail = await stock_service.get_stock_detail(db, symbol)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mã '{symbol.upper()}'")
    try:
        pdf, filename = await report_pdf.generate(db, symbol)
    except Exception as exc:  # noqa: BLE001 — render/browser failures → 502
        logger.warning("[report] %s failed — %s", symbol, exc)
        raise HTTPException(status_code=502, detail="Lỗi tạo báo cáo PDF") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{symbol}/fraud-scores", response_model=Envelope[dict])
async def get_fraud_scores(symbol: str, db: AsyncSession = Depends(get_db)) -> Envelope[dict]:
    """Beneish/Altman/Piotroski screening scores (pure math, no AI). Research-only."""
    data = await fraud_api.build_fraud_response(db, symbol)
    if data is None:
        return Envelope(success=False, error="Chưa đủ dữ liệu BCTC (cần ≥2 năm) để tính")
    return Envelope(data=data)


@router.post("/{symbol}/research-search", response_model=Envelope[dict])
async def research_search_endpoint(
    symbol: str, body: ResearchRequest, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    """Auto-search public news to help answer the digest's research questions."""
    detail = await stock_service.get_stock_detail(db, symbol)
    company = detail.company_name if detail else None
    data = await research_search.search_answers(
        symbol, company, [q.model_dump() for q in body.questions]
    )
    return Envelope(data=data)


@router.get("/{symbol}/ohlc", response_model=Envelope[list[OhlcBar]])
async def get_ohlc(
    symbol: str, days: int = Query(default=120, ge=5, le=500)
) -> Envelope[list[OhlcBar]]:
    bars = await stock_service.get_ohlc(symbol, days)
    return Envelope(data=bars, meta={"symbol": symbol.upper(), "count": len(bars)})


@router.get("/{symbol}/technicals", response_model=Envelope[dict])
async def get_technicals(
    symbol: str, days: int = Query(default=200, ge=30, le=500)
) -> Envelope[dict]:
    """Technical indicators (SMA/RSI/MACD/Bollinger/ATR/52w) from OHLC. Descriptive only."""
    bars = await stock_service.get_ohlc(symbol, days)
    data = technicals.build_technicals(bars)
    return Envelope(data=data, meta={"symbol": symbol.upper(), "bars": len(bars)})


@router.get("/{symbol}/backtest", response_model=Envelope[dict])
async def get_backtest(
    symbol: str,
    fast: int = Query(default=20, ge=2, le=100),
    slow: int = Query(default=50, ge=5, le=250),
    days: int = Query(default=400, ge=60, le=500),
) -> Envelope[dict]:
    """Hypothetical SMA-crossover backtest vs buy-and-hold (research-only, not a signal)."""
    bars = await stock_service.get_ohlc(symbol, days)
    closes = [b["close"] for b in bars if b.get("close") is not None]
    data = backtest.run_backtest(closes, fast=fast, slow=slow)
    return Envelope(data=data, meta={"symbol": symbol.upper(), "bars": len(bars)})


@router.get("/{symbol}/lenses", response_model=Envelope[list])
async def get_lenses(symbol: str, db: AsyncSession = Depends(get_db)) -> Envelope[list]:
    """Investment-school criteria checklists (Graham/Lynch/Quality). Descriptive only."""
    rows = await stock_service.metrics_for_symbols(db, [symbol.strip().upper()])
    metrics = rows[0].model_dump() if rows else {}
    return Envelope(data=lenses.evaluate_lenses(metrics), meta={"symbol": symbol.upper()})


@router.get("/{symbol}/valuation", response_model=Envelope[dict])
async def get_valuation(
    symbol: str,
    exclude_outliers: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
) -> Envelope[dict]:
    data = await valuation.get_valuation(db, symbol, exclude_outliers)
    if "error" in data:
        return Envelope(success=False, error=data["error"])
    return Envelope(data=data)


@router.get("/{symbol}/valuation/sector", response_model=Envelope[dict])
async def get_sector_valuation(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    """Relative valuation vs same-industry peers (median P/E & P/B). No BCTC needed."""
    data = await valuation.get_sector_valuation(db, symbol)
    if "error" in data:
        return Envelope(success=False, error=data["error"])
    return Envelope(data=data)


@router.post("/{symbol}/news-signals", response_model=Envelope[dict])
async def post_news_signals(
    symbol: str, force: bool = Query(default=False)
) -> Envelope[dict]:
    """Classify recent per-stock headlines into event + sentiment signals (AI, on demand)."""
    try:
        data = await news_signals.get_news_signals(symbol, force=force)
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (AnalysisParseError, httpx.HTTPError) as exc:
        raise HTTPException(status_code=502, detail=f"Lỗi phân tích tin: {exc}") from exc
    return Envelope(data=data)


@router.get("/{symbol}/foreign", response_model=Envelope[dict])
async def get_symbol_foreign(symbol: str) -> Envelope[dict]:
    """Latest-session foreign (khối ngoại) flow + ownership room for a symbol (VCI)."""
    return Envelope(data=await foreign_stock.get_symbol_foreign(symbol))


@router.get("/{symbol}/prop-trading", response_model=Envelope[dict])
async def get_symbol_prop(symbol: str) -> Envelope[dict]:
    """Latest-session proprietary-desk (tự doanh) flow for a symbol (CafeF)."""
    return Envelope(data=await prop_trading.get_symbol_prop(symbol))


@router.get("/{symbol}/insider", response_model=Envelope[dict])
async def get_symbol_insider(symbol: str) -> Envelope[dict]:
    """Filed insider transactions (giao dịch nội bộ) + net-direction summary (VCI)."""
    return Envelope(data=await insider.get_insider(symbol))


@router.get("/{symbol}/conviction", response_model=Envelope[dict])
async def get_conviction(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    """Financial-trust profile: forensic + QoE + sector valuation synthesized (no AI)."""
    data = await conviction.get_conviction(db, symbol)
    if data is None:
        return Envelope(success=False, error="Chưa đủ dữ liệu để dựng hồ sơ tin cậy.")
    return Envelope(data=data)


@router.get("/{symbol}/compass", response_model=Envelope[dict])
async def get_compass(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    return Envelope(data=await compass.get_compass(db, symbol))


@router.get("/{symbol}/peers", response_model=Envelope[dict])
async def get_peers(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    data = await peers.get_peer_comparison(db, symbol)
    if "error" in data:
        return Envelope(success=False, error=data["error"])
    return Envelope(data=data)


@router.post("/{symbol}/valuation/dcf", response_model=Envelope[dict])
async def post_valuation_dcf(
    symbol: str, body: ValuationDcfBody, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    data = await valuation.get_dcf(
        db, symbol, body.growth_rate, body.discount_rate, body.years
    )
    if "error" in data:
        return Envelope(success=False, error=data["error"])
    return Envelope(data=data)
