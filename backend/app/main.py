"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import (
    admin,
    alerts,
    analytics,
    assistant,
    auth,
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
    waitlist_signup,
)
from app.services.auth import decode_token

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public path prefixes that never require a session (auth flow, waitlist, health).
# Matched on segment boundaries so a future "/waitlistadmin" can't slip through. API docs
# are intentionally NOT public → gated with everything else when auth_required.
_PUBLIC_PREFIXES = ("/health", "/auth", "/waitlist")


def _is_public(path: str) -> bool:
    if path == "/":
        return True
    return any(path == p or path.startswith(p + "/") for p in _PUBLIC_PREFIXES)


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    """When auth_required (prod), non-public routes need a valid session cookie.

    Off by default so local dev + the test suite stay open; the frontend still gates the
    app UI regardless. CORS preflight (OPTIONS) always passes."""
    if settings.auth_required and request.method != "OPTIONS" and not _is_public(request.url.path):
        token = request.cookies.get(settings.auth_cookie_name) or ""
        if not decode_token(token, settings.jwt_secret):
            return JSONResponse({"success": False, "error": "Yêu cầu đăng nhập."}, status_code=401)
    return await call_next(request)


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

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(waitlist_signup.router)
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
