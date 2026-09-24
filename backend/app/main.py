"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    alerts,
    analytics,
    assistant,
    dashboard,
    documents,
    journal,
    markets,
    meta,
    news,
    notes,
    playbook,
    reports,
    portfolio,
    screener,
    stocks,
    watchlist,
)

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("vnios")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = None
    if settings.scheduler_enabled:
        from app.tasks.sync import start_scheduler

        scheduler = start_scheduler()
        logger.info("APScheduler started")
    yield
    if scheduler is not None:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="V-Investment OS API",
    version="0.1.0",
    description="Phase 1 — Fundamental Screener for Vietnam equities.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Baseline security response headers (cheap, public-facing hardening)."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if settings.app_env == "production":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response

app.include_router(stocks.router)
app.include_router(screener.router)
app.include_router(meta.router)
app.include_router(watchlist.router)
app.include_router(journal.router)
app.include_router(documents.router)
app.include_router(playbook.router)
app.include_router(portfolio.router)
app.include_router(news.router)
app.include_router(analytics.router)
app.include_router(markets.router)
app.include_router(dashboard.router)
app.include_router(assistant.router)
app.include_router(alerts.router)
app.include_router(notes.router)
app.include_router(reports.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
