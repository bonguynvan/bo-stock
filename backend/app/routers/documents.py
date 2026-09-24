"""BCTC document upload + AI analysis (single-user, no auth)."""
from __future__ import annotations

import logging
import os
import zipfile
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import Document
from app.schemas.document import DocumentOut
from app.schemas.stock import Envelope
from app.services import consideration, peers, report_crawler
from app.services.llm import AnalysisParseError, LLMNotConfigured, analyze_pdf

logger = logging.getLogger("vnios.documents")
router = APIRouter(prefix="/documents", tags=["documents"])


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _to_out(d: Document) -> DocumentOut:
    return DocumentOut(
        id=d.id,
        symbol=d.symbol,
        filename=d.filename,
        size_bytes=d.size_bytes,
        source_url=d.source_url,
        report_period=d.report_period,
        analysis=d.analysis,
        analysis_model=d.analysis_model,
        consideration_summary=d.consideration_summary,
        uploaded_at=_iso(d.uploaded_at),
        analyzed_at=_iso(d.analyzed_at),
    )


@router.post("", response_model=Envelope[DocumentOut])
async def upload_document(
    file: UploadFile = File(...),
    symbol: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
) -> Envelope[DocumentOut]:
    settings = get_settings()
    name = file.filename or "document.pdf"
    if not name.lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file PDF")

    contents = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=400, detail=f"File vượt quá {settings.max_upload_mb}MB"
        )
    if not contents:
        raise HTTPException(status_code=400, detail="File rỗng")

    sym = (symbol or "").strip().upper() or None
    # Infer the reporting period from the filename (e.g. "..._Q1_2026" → quarterly)
    # so uploads also stay out of the annual valuation series when appropriate.
    row = Document(
        symbol=sym, filename=name, stored_path="", size_bytes=len(contents),
        report_period=report_crawler.classify_period(name, name),
    )
    db.add(row)
    await db.flush()  # assign id

    os.makedirs(settings.upload_dir, exist_ok=True)
    path = os.path.join(settings.upload_dir, f"{row.id}.pdf")
    with open(path, "wb") as fh:
        fh.write(contents)
    row.stored_path = path
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


class FetchReportRequest(BaseModel):
    symbol: str
    url: str | None = None  # a specific report URL (from /available); else latest


_ALLOWED_PDF_HOSTS = ("static1.vietstock.vn", "static2.vietstock.vn", "static.vietstock.vn")


def _is_allowed_report_url(url: str) -> bool:
    """Only fetch BCTC reports from the Vietstock CDN (avoid SSRF to arbitrary URLs)."""
    return (
        url.startswith("https://")
        and any(h in url for h in _ALLOWED_PDF_HOSTS)
        and "/BCTC/" in url.upper()
        and url.lower().rsplit(".", 1)[-1] in ("pdf", "zip")
    )


@router.get("/available/{symbol}", response_model=Envelope[dict])
async def available_reports(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    """List the BCTC reports Vietstock has for ``symbol`` (no download, no AI).

    Marks which years are already in the system so the UI can offer a year picker.
    """
    sym = symbol.strip().upper()
    try:
        reports = await report_crawler.crawl_reports(sym)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[crawl] available %s failed — %s", sym, exc)
        raise HTTPException(status_code=502, detail="Không lấy được danh sách BCTC") from exc

    have = set(
        (await db.execute(select(Document.source_url).where(Document.symbol == sym)))
        .scalars()
        .all()
    )
    listed = [{**r, "in_system": r["url"] in have} for r in reports]
    return Envelope(data={"symbol": sym, "reports": listed})


@router.post("/fetch", response_model=Envelope[DocumentOut])
async def fetch_report(
    req: FetchReportRequest, db: AsyncSession = Depends(get_db)
) -> Envelope[DocumentOut]:
    """Crawl + store a BCTC PDF for ``symbol`` as a PENDING document (analysis=NULL).

    Without ``url`` it pulls the latest audited PDF; with ``url`` (from /available)
    it pulls that specific year. No AI is called here — analysis is a separate,
    user-confirmed step."""
    settings = get_settings()
    sym = req.symbol.strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="Thiếu mã cổ phiếu")

    if req.url:
        if not _is_allowed_report_url(req.url):
            raise HTTPException(status_code=400, detail="URL báo cáo không hợp lệ")
        year_m = report_crawler._YEAR_IN_HREF.search(req.url)
        report = {
            "url": req.url,
            "year": int(year_m.group(1)) if year_m else None,
            "period": report_crawler.classify_period(req.url),
        }
    else:
        try:
            reports = await report_crawler.crawl_reports(sym)
        except Exception as exc:  # noqa: BLE001 — surface crawl failures as 502
            logger.warning("[crawl] %s failed — %s", sym, exc)
            raise HTTPException(
                status_code=502, detail="Không lấy được danh sách BCTC từ Vietstock"
            ) from exc
        report = report_crawler.latest_report(reports)
        if report is None:
            raise HTTPException(
                status_code=404, detail=f"Vietstock không có BCTC cho {sym}"
            )

    # Idempotent: if this exact report is already stored, return it (don't re-download).
    existing = (
        await db.execute(select(Document).where(Document.source_url == report["url"]))
    ).scalar_one_or_none()
    if existing is not None:
        return Envelope(data=_to_out(existing))

    try:
        pdf = await report_crawler.download_report(
            report["url"], settings.max_upload_mb * 1024 * 1024
        )
    except (httpx.HTTPError, ValueError, zipfile.BadZipFile) as exc:
        logger.warning("[crawl] download %s failed — %s", report["url"], exc)
        raise HTTPException(status_code=502, detail="Lỗi tải BCTC từ Vietstock") from exc

    name = report_crawler.filename_from_url(report["url"], sym, report.get("year"))
    row = Document(
        symbol=sym, filename=name, stored_path="", size_bytes=len(pdf),
        source_url=report["url"], report_period=report.get("period"),
    )
    db.add(row)
    await db.flush()
    os.makedirs(settings.upload_dir, exist_ok=True)
    path = os.path.join(settings.upload_dir, f"{row.id}.pdf")
    with open(path, "wb") as fh:
        fh.write(pdf)
    row.stored_path = path
    await db.commit()
    await db.refresh(row)
    return Envelope(data=_to_out(row))


class SummaryRequest(BaseModel):
    symbol: str
    force: bool = False


@router.get("/summary", response_model=Envelope[dict])
async def get_summary(
    symbol: str, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    """The stored \"Tóm tắt để cân nhắc\" for a symbol (no AI). ``summary`` may be null."""
    return Envelope(data={"summary": await consideration.get_stored(db, symbol)})


@router.post("/summary", response_model=Envelope[dict])
async def make_summary(
    req: SummaryRequest, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    """Synthesize the digest from existing analysis + valuation + Compass (cheap,
    JSON — no PDF). Auto-called right after a BCTC analysis. Cache-guarded by ``force``."""
    sym = req.symbol.strip().upper()
    try:
        summary = await consideration.generate(db, sym, force=req.force)
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        logger.warning("[summary] %s failed — %s", sym, exc)
        raise HTTPException(status_code=502, detail="Lỗi gọi API tóm tắt") from exc
    except AnalysisParseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if summary is None:
        raise HTTPException(
            status_code=404, detail="Chưa có BCTC nào được phân tích cho mã này"
        )
    return Envelope(data={"summary": summary})


@router.get("", response_model=Envelope[list[DocumentOut]])
async def list_documents(
    symbol: str | None = None, db: AsyncSession = Depends(get_db)
) -> Envelope[list[DocumentOut]]:
    stmt = select(Document).order_by(Document.uploaded_at.desc())
    if symbol:
        stmt = stmt.where(Document.symbol == symbol.upper())
    rows = (await db.execute(stmt)).scalars().all()
    return Envelope(data=[_to_out(d) for d in rows])


@router.get("/{doc_id}/file")
async def download_document(
    doc_id: int, db: AsyncSession = Depends(get_db)
) -> FileResponse:
    row = await db.get(Document, doc_id)
    if row is None or not os.path.exists(row.stored_path):
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(row.stored_path, media_type="application/pdf", filename=row.filename)


@router.post("/{doc_id}/analyze", response_model=Envelope[DocumentOut])
async def analyze_document(
    doc_id: int, force: bool = False, db: AsyncSession = Depends(get_db)
) -> Envelope[DocumentOut]:
    row = await db.get(Document, doc_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    # Credit guard: a stored analysis is returned as-is (no AI spend) unless the
    # caller explicitly forces a re-analysis.
    if row.analysis is not None and not force:
        return Envelope(data=_to_out(row))
    if not os.path.exists(row.stored_path):
        raise HTTPException(status_code=404, detail="File không tồn tại trên đĩa")

    with open(row.stored_path, "rb") as fh:
        pdf_bytes = fh.read()
    # Give the model REAL industry medians (from our DB) so ratio benchmarks are
    # concrete instead of "cần so sánh ngành". Best-effort — never blocks analysis.
    industry_context: str | None = None
    if row.symbol:
        try:
            bench = await peers.industry_benchmark(db, row.symbol)
            if bench:
                industry_context = peers.benchmark_context_text(bench)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[analyze] industry benchmark for %s failed — %s", row.symbol, exc)
    try:
        result = await analyze_pdf(pdf_bytes, row.symbol, industry_context)
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        logger.warning("[LLM] analyze failed for doc %d — %s", doc_id, exc)
        raise HTTPException(status_code=502, detail="Lỗi gọi API phân tích") from exc
    except AnalysisParseError as exc:
        logger.warning("[LLM] analyze parse failed for doc %d — %s", doc_id, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    row.analysis = result
    row.analysis_model = get_settings().anthropic_model
    row.analyzed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)

    # Precompute the Compass badge so it shows in the screener without opening detail.
    if row.symbol:
        try:
            from app.services import compass

            await compass.get_compass(db, row.symbol)
        except Exception as exc:  # noqa: BLE001 — never fail analyze over the cache
            logger.warning("[compass] cache update failed for %s — %s", row.symbol, exc)

    return Envelope(data=_to_out(row))


@router.delete("/{doc_id}", response_model=Envelope[dict])
async def delete_document(
    doc_id: int, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    row = await db.get(Document, doc_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if row.stored_path and os.path.exists(row.stored_path):
        os.remove(row.stored_path)
    await db.delete(row)
    await db.commit()
    return Envelope(data={"id": doc_id, "deleted": True})
