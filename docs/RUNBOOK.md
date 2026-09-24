# Runbook

How to run, seed, test, and verify. Portable (lives in the repo). Windows host; commands
use Git Bash. Backend runs in Docker (python:3.12); frontend on host Node 24.

## Prerequisites
- Docker Desktop running (engine up)
- Node 24 / npm 11 (frontend)
- `cp .env backend/.env` already present locally? If not: `cp backend/.env.example backend/.env`
  and set `POSTGRES_HOST=postgres` for the compose network. Root `.env` needs `POSTGRES_PASSWORD`.

## Start the stack
```bash
docker compose up -d postgres        # Postgres 16
docker compose build backend         # python:3.12 image (pip install)
docker compose run --rm backend alembic upgrade head   # migrate
docker compose up -d backend         # API at http://localhost:8000/docs
```

## Frontend
```bash
cd frontend
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                          # http://localhost:3000
```

## Seed / verify the pipeline
```bash
# Offline (sample data) — works anywhere:
docker compose run --rm backend python -m scripts.seed_stocks --fixtures

# Live VCI dry-run (gentle: sequential to avoid the WAF):
docker compose run --rm -e DATA_PROVIDER=vci -e HTTP_RATE_LIMIT_PER_SEC=1 \
  backend python -m scripts.seed_stocks
```
`seed_stocks` runs the 6-step check: fetch list → metrics for VCB/FPT/MWG/VNM/HPG →
seed DB → screen (ROE>15, P/E<20) → print top 10.

## Full-universe sync (all ~1745 symbols)
```bash
# Safe pacing (4 req/s, ~15 min). Skips day-change/OHLC (a daily price concern).
docker compose run --rm -e DATA_PROVIDER=vci -e HTTP_RATE_LIMIT_PER_SEC=4 \
  backend python -m scripts.full_sync
```
Logs `[PROGRESS] done/total ok/empty/failed + ETA` every 50 symbols, then prints a report
(success/empty/failed, failure reasons, >50%-NULL data-quality list) and writes
`backend/full_sync_report.json`. Flags: `--limit N` (cap symbols), `--concurrency N`.

Last full run (2026-06-29): **1724/1745 ok, 0 failed, 21 empty, 0 low-quality**. The 21
"empty" are `data_missing`: 19 have zero records at VCI (newly-listed/suspended/non-equity);
2 (TC6, TDN — coal miners) have records in a variant shape (`ratioType: null`, only `roe`
populated) that the TTM-focused `parse_vci_ratio` skips. Not worth a parser change for 2/1745.

## Tests
```bash
docker compose run --rm backend pytest          # backend unit tests (DB-free)
cd frontend && npm run test:cov                 # frontend Vitest + coverage
```

## E2E screenshot (Playwright)
```bash
cd frontend            # playwright + chromium already installed
# with backend + dev server running, run a script that:
#   chromium.launch() → goto http://localhost:3000 → waitForTimeout → screenshot(path)
# (see git history for shot.mjs / click.mjs examples)
```

## Enable BCTC AI analysis (Claude)
Set in `backend/.env` then recreate the backend container:
```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6   # optional; default
# UPLOAD_DIR=uploads  MAX_UPLOAD_MB=20  (optional)
```
```bash
docker compose up -d --force-recreate backend
```
Uploaded PDFs live in `backend/uploads/` (gitignored). Without the key, upload/list
work but `POST /documents/{id}/analyze` returns 503 (graceful). Research-only: the
model extracts/summarizes — it does not give buy/sell advice.

## Terminal — global connectors + index tape
The terminal HOME + Global Markets view aggregate free/public sources:
- **World markets** (Yahoo) + **Crypto** (CoinGecko) need **no key** — work out of the box.
- **Macro** (FRED) is freemium. Get a free key (fred.stlouisfed.org), set in `backend/.env`:
  ```bash
  FRED_API_KEY=...
  ```
  then `docker compose up -d --force-recreate backend`. Without it, `GET /markets/macro`
  returns empty + a setup note (graceful); the Macro panel shows how to enable it.
- **VN index tape** (top bar) is empty until index bars are synced:
  ```bash
  curl -X POST http://localhost:8000/analytics/sync-index    # VN-Index / VN30 / HNX (KBS)
  ```
  Enable the scheduler (`SCHEDULER_ENABLED=true`) for a daily refresh.
- **Dashboard layout** persists in the `dashboard_layout` table (migration `0017`); use the
  "Tùy chỉnh" button on HOME to show/hide + reorder tiles. No key needed.

## Provider selection
`DATA_PROVIDER` = `resilient` (default, VCI→TCBS) | `vci` | `tcbs` | `fixtures`.
Override per-run with `-e DATA_PROVIDER=...`. TCBS only works from a VN IP — see `DATA_SOURCES.md`.

## Teardown
```bash
docker compose down          # keep volume
docker compose down -v       # also drop pgdata
```

## Gotchas
- Reading API JSON in host Python may mojibake Vietnamese (Windows cp1252 stdin) — the API
  itself returns correct UTF-8; use `PYTHONUTF8=1` and read bytes when debugging.
- VCI WAF: don't hammer; one shared client + rate limit. See `DATA_SOURCES.md`.
