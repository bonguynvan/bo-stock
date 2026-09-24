"""Multi-symbol report builder (research-only PDF)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import report_multi

logger = logging.getLogger("vnios.reports")
router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/compare.pdf")
async def compare_report(
    symbols: str = Query(..., description="Comma-separated tickers"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Side-by-side comparison PDF (metrics + lenses + fraud screen) for a symbol set."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:12]
    if not syms:
        raise HTTPException(status_code=400, detail="Cần ít nhất một mã.")
    try:
        pdf, filename = await report_multi.generate_compare(db, syms)
    except Exception as exc:  # noqa: BLE001
        logger.exception("compare report failed")
        raise HTTPException(status_code=500, detail=f"Không tạo được báo cáo: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
