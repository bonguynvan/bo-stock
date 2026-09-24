# V-Investment OS — Fundamental Screener

Personal **research** tooling for the Vietnam equity market (HOSE / HNX / UPCOM):
pull fundamental metrics, store them in PostgreSQL, filter + rank, detect fraud/manipulation
risk, and explore via a **terminal-style** dark UI — command bar (`Ctrl/⌘K`), a customizable
multi-panel dashboard, and a per-symbol workspace. **Research-only** — no order execution,
trading terminal, or investment advice (see [docs/DECISIONS.md](docs/DECISIONS.md)).

Stack: **FastAPI** (async) · **PostgreSQL 16** · **Next.js** (App Router, TS strict).
VN equity data from **VCI (Vietcap)** (TCBS fallback); global context (world indices, crypto,
macro) aggregated from free/public sources (Yahoo / CoinGecko / FRED).

## Docs

- [docs/RUNBOOK.md](docs/RUNBOOK.md) — how to run, seed, test, dry-run (start here)
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) — provider + connector endpoints, shapes, quirks
- [docs/DECISIONS.md](docs/DECISIONS.md) — scope and durable decisions
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — shared backend/frontend API contract

## Layout

```
backend/    FastAPI + asyncpg + SQLAlchemy async + Alembic + APScheduler
frontend/   Next.js App Router + Tailwind
docs/       RUNBOOK · DATA_SOURCES · DECISIONS · API_CONTRACT
docker-compose.yml
```

## Quick start (Docker)

Requires Docker Desktop (or Docker Engine + Compose v2.24+).

```bash
git clone https://github.com/bonguynvan/bo-stock.git && cd bo-stock
docker compose up --build          # postgres + backend (auto-migrates) + frontend
```

Open **http://localhost:3000** (API docs: http://localhost:8000/docs). The database starts empty —
load some data in a second terminal:

```bash
# 5 sample tickers, offline, ~10 seconds — enough to try the UI:
docker compose run --rm backend python -m scripts.seed_stocks --fixtures

# Real data for the whole market (VCI, ~15 min, gentle rate limit):
docker compose run --rm -e DATA_PROVIDER=vci -e HTTP_RATE_LIMIT_PER_SEC=1   backend python -m scripts.full_sync --concurrency 4
```

Optional features (AI analysis/assistant, macro data) need keys: `cp backend/.env.example backend/.env`,
set `ANTHROPIC_API_KEY` / `FRED_API_KEY`, then `docker compose up -d --force-recreate backend`.

Everything binds to `127.0.0.1` only. Stop with `docker compose down` (add `-v` to wipe the database).
Hot-reload dev mode: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.

Full commands and gotchas: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Desktop app (Tauri)

A native desktop build wraps the frontend (static-exported) in a Tauri (Rust) shell and
points at your **local** backend.

```bash
# backend running first (Docker, as above) → http://localhost:8000
cd frontend && npm install --legacy-peer-deps   # pulls @tauri-apps/cli + api

npm run tauri:dev      # dev: Next dev server + Tauri window, hot reload
npm run tauri:build    # production installers → src-tauri/target/release/bundle/
```

Needs the Rust toolchain (`rustup`) + the OS webview (WebView2 on Windows, ships with
Windows 11). The desktop build is gated by `DESKTOP_BUILD=1`/`NEXT_PUBLIC_DESKTOP=1`
(see `next.config.mjs`, `src/lib/desktop.ts`); the web build (`npm run build`) is
unaffected. Tauri config: `frontend/src-tauri/tauri.conf.json`.

**Multi-window / MDI** (`src/lib/desktopWindows.ts`, `room.ts`, `workspace.ts`):
- **New window** (top bar) opens an independent terminal; **pop-out** on a stock detail /
  Nhịp TT opens a *frameless* window rendering just that screen (`?view=detach`, own slim
  title bar with drag/dock/close) — see `DetachedView`, `AppRouter`.
- **Linked symbol (room):** the active symbol is shared across windows over a Tauri
  broadcast — the main window drives it, `◉`-linked detail windows follow.
- **Bàn làm việc (workspace):** an in-app floating-panel MDI (drag/resize/z-order) to lay
  several screens side by side; layout persists to localStorage. Works on web too.

## Security note

There is **no login**: the app is single-user and self-hosted. Run it on your own machine or a
trusted network. Do **not** expose the backend to the public internet — anyone reaching it could
read/modify your portfolio and journal and spend your `ANTHROPIC_API_KEY`. If you deploy it
remotely, put it behind your own auth (reverse proxy, VPN, or SSO gateway).

## Data source note

**VCI (Vietcap)** is the primary source and works from anywhere. **TCBS**
(`apipubaws.tcbs.com.vn`) is geo-restricted to Vietnam (404 elsewhere) and is the
fallback. `DATA_PROVIDER=resilient` (default) chains VCI → TCBS;
`--fixtures` seeds sample data so the pipeline can be verified offline.

Global-context panels aggregate free/public sources: **Yahoo Finance** (world indices/
commodities/FX) and **CoinGecko** (crypto) need no key; **FRED** (macro) uses a free
`FRED_API_KEY` and degrades gracefully without it. VN index bars come from **KBS**. See
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Constraints

- Provider HTTP: rate-limited, 10s timeout, 3 retries. VCI needs a handshake + gentle pacing.
- Type safety: Pydantic v2 (backend), TypeScript strict (frontend).

## License

Apache License 2.0 — see [LICENSE](LICENSE). Market data is fetched from third-party public sources (VCI, CafeF, Vietstock, etc.) that have their own terms; this license covers the code only, not the data.
