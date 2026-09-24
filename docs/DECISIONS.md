# Decisions

Durable project decisions. Portable (lives in the repo). Newest first.

## Terminal shell + multi-source connectors (2026-07-29)

The app is packaged as a **terminal-style research workstation** (command bar, customizable
multi-panel dashboard, per-symbol workspace) built on the existing bo-stock foundation — not
a separate desktop app. Global-market context (world indices, crypto, macro) is aggregated
from **free/public sources** (Yahoo / CoinGecko / FRED) behind the provider abstraction,
Fincept-style; VN equity data stays on VCI.

- **Still research-only:** global data is *context* (last price / change), never advice;
  connectors surface neutral numbers. Order execution / advisory remain out of scope.
- Full roadmap done through Phase 3.

## Scope: research-only (2026-06-29)

V-Investment OS is a **personal fundamental research / screener tool**. Out of scope:
- order execution / placing trades
- a live trading terminal (order entry, brokerage integration)
- investment advisory: personalized recommendations or **buy/sell signals**

Consequences:
- The sidebar "Execute Order" CTA was removed (→ "Research Only").
- We do **not** surface third-party advisory fields from data providers (e.g. VCI
  `rating` BUY/SELL, `targetPrice`, `projectedTSR`).
- The **quant score** is a transparent screening rank, not advice — keep it framed that way.

Commercial use is out of scope for now and would be gated on a data license.

## Data provider strategy (2026-06-29)

- **VCI (Vietcap) is the primary** source — maintained and reachable outside Vietnam.
- **TCBS is a fallback** — geo-blocked to Vietnam, and dropped from current `vnstock`.
- Default `DATA_PROVIDER=resilient` chains VCI → TCBS with per-method fallback.
- See `DATA_SOURCES.md` for endpoints/quirks.

## Run backend via Docker, not host venv (2026-06-29)

Local Python is 3.14; `pydantic-core` (PyO3 ≤ 3.13) and `asyncpg` have no 3.14 wheels and
fail to build. The backend image pins **python:3.12**. Run everything (migrate, seed, tests)
through `docker compose`. Frontend runs fine on host Node 24.

## Default screener filter loosened (2026-06-29)

The design mock styled all filter chips as "active" (P/E≤15 & ROE≥15 & ROA≥5 & D/E≤0.5 &
div≥3%) — that intersection matches **zero** stocks, so first paint looked broken. Default is
now a quality-discovery preset (`ROE≥10, P/E≤30`, others off) in
`frontend/src/components/ScreenerForm.tsx:DEFAULT_FORM_STATE`. Users tighten from there.

## Knowledge lives in repo docs (2026-06-29)

Project knowledge is kept in `docs/` (this folder) so it travels across devices, not only in
the per-device Claude memory dir. New decisions/notes go here.

## Strategic direction: go deep on the forensic/insight layer, not the data pipeline (2026-08-01)

vnstock already owns the VN market **data-access layer** (connectors, normalized schemas,
source-quirk handling) — it is a mature, open, commodity floor. Re-building a pipeline to
compete there is undifferentiated and high-maintenance (WAF workarounds forever). Our own
VCI/TCBS connectors already cover what the analysis needs.

Decision: invest depth in the layers vnstock does **not** touch — the "so what" on top of
the numbers. Priority order:
1. **Forensic / earnings-quality + sector valuation** (chosen first — cheap, deterministic,
   testable, and we already have the fraud models). vnstock gives the numbers; we judge
   whether earnings are real and fairly valued — high differentiation for VN's variable
   accounting quality, and fits the research-only scope.
2. **Alt-data / signals** (foreign flow, insider/related-party, Vietnamese news NLP) — real
   alpha, VN-NLP is underserved. Build *after* #1 (heavier: ingest + ML), and #1's flagged
   names become #2's watchlist. Sequential, not parallel.
3. **AI research OS** — the glue that turns #1+#2 into narratives.

Traps to avoid: (a) don't out-plumb vnstock — consider using it as the floor; (b) keep
factor/backtest **descriptive** (VN market is shallow/penny-heavy → factor "alpha" overfits).

First increment shipped: **Quality of Earnings (QoE)** — `services/earnings_quality.py`
(pure), persisted on `fraud_scores` (migration 0020), exposed in `/stocks/{symbol}/fraud-scores`,
rendered in the existing `FraudDetectionPanel` (no new sidebar item — menu is already dense).

### Giai đoạn 1 progress (2026-08-01)
- ✅ Quality of Earnings (QoE) — cash-vs-accrual score on the forensic panel.
- ✅ Sector-relative valuation — `build_sector_valuation` + `get_sector_valuation`,
  `GET /stocks/{symbol}/valuation/sector`, rendered in `ValuationPanel` via a self-fetching
  `SectorValuationCard` (also shows when intrinsic valuation lacks history). Descriptive
  peer-multiple comparison, no margin of safety. Next: wire QoE into the screener
  (filter/sort by `earnings_quality_flag`, warning glyph) and fold QoE into Compass.
- ✅ Financial-trust profile ("thẻ tin cậy/rủi ro") — `conviction.build_conviction_profile`
  (pure) synthesizes forensic + QoE + sector valuation into 4 quality/risk pillars +
  cross-signal corroboration + a descriptive overall read (solid/mixed/watch/elevated_risk/
  insufficient). Deterministic, NO AI, NO single numeric rating (would read as advice).
  `get_conviction` composes `fraud_api` + `get_sector_valuation`; `GET /stocks/{symbol}/conviction`;
  `ConvictionCard` sits at the top of the stock detail (after Compass). This is the
  convergence point of Giai đoạn 1 — the differentiated "is earnings real + fairly valued"
  view. Next candidates: wire QoE/flags into the screener; a batch conviction column.
- ✅ QoE in the screener — market-wide scan by earnings quality: a sortable/filterable
  "CL LN" (QoE 0-100) column on the grid + a "hide weak QoE" filter
  (`exclude_weak_earnings_quality`), mirroring the existing Beneish glyph/hide-high-risk.
  `StockResult` now carries `earnings_quality_flag`/`_score` (attached from the latest
  `fraud_scores`). Consolidates Giai đoạn 1: forensic quality is now visible across the
  whole universe, not just per-stock.
- ✅ Conviction profile market-wide — the per-stock trust profile lifted to the whole
  universe as a severity-ranked "Hồ sơ" screener column (elevated_risk→solid), reusing
  `conviction.overall_from_scores` over the persisted `fraud_scores` (0 extra queries —
  computed in `_attach_fraud_fields`). Market read omits the valuation pillar (cheap); the
  per-stock card stays the richer version. No new nav item (kept the grouped menu tidy).
  **Giai đoạn 1 closed:** per-stock (QoE + sector valuation + trust card) AND market-wide
  (QoE column + trust column) — soi một mã đến sàng cả sàn.

## Giai đoạn 2 opener: news signals (2026-08-02)
Alt-data/signals begins with the differentiated, no-new-data-source piece: Vietnamese
news NLP. `POST /stocks/{symbol}/news-signals` classifies recent headlines
(`news.symbol_news`) into event type + sentiment + a neutral extract via the LLM
(`llm.classify_news_signals`; pure `normalize_news_signals` maps model output onto
authoritative RSS metadata so links/sources can't be fabricated). Runs ONLY on an explicit
button press (scope: AI on user action), 30-min TTL cache. Rendered by `NewsSignalsPanel`
in the stock detail (no new nav item). The event taxonomy (insider_shareholder /
regulatory_legal / earnings) is chosen to corroborate Giai đoạn 1 forensic red flags —
the flagged→watchlist→signal bridge. Next: correlate flags with negative/insider signals
(a "radar" over the flagged set); later, per-stock foreign-flow if a source appears.
- ✅ Signal radar — completes the flagged→watchlist→signal bridge at market level.
  `GET /screener/radar`: flagged stocks (forensic/QoE) ranked by severity + a cheap
  recent-news overlay (RSS headline, NO LLM), full AI classification stays per-stock.
  New "Radar" nav item under the Nghiên cứu group (grouped menu absorbs it cleanly).
  `SignalRadarView` table, row→detail. This is where Giai đoạn 1 risk meets Giai đoạn 2
  news. Next: fold recent news sentiment into the conviction card; per-stock foreign flow
  if a source appears.
- ✅ Radar-watch alerts — the radar made proactive within scope: `GET /alerts/radar-watch`
  cross-references followed symbols (watchlists ∪ portfolio) with the risk radar
  (`signal_radar.flagged_among`, deterministic, no AI/news) + reasons, surfaced as a
  "Radar rủi ro — mã đang theo dõi" section atop AlertsView (row→detail). News-sentiment
  auto-alerts deferred (would need news persistence + a scheduler + AI-on-schedule, which
  conflicts with the AI-on-explicit-action scope); the per-stock AI news panel stays the
  on-demand path. Closes the flagged→watchlist→signal loop back to the user.

## Public landing + self-hosted auth (2026-08-02)
Going public as a **landing + waitlist**, app behind a **private-beta login** — deliberately
NOT exposing the VCI-derived data to strangers (respects the data-licensing gate). Decisions: self-hosted JWT (bcrypt + PyJWT, HS256) in an httpOnly cookie — no external
auth SaaS; registration gated by an invite code (`AUTH_INVITE_CODE`); a config-gated
`auth_gate` middleware (`AUTH_REQUIRED`) protects non-public routes in prod while leaving
dev/tests open. **No multi-tenancy yet** — data stays global behind login; per-user scoping
(user_id on watchlist/alerts/playbook/dashboard/portfolio/notes/saved_filters) is a later
migration. Frontend restructured: `/` landing, `/login` `/register`, `/app` (AuthGuard).
Prod checklist: strong JWT_SECRET, AUTH_COOKIE_SECURE=true, AUTH_REQUIRED=true, set invite code.

## Multi-tenancy — per-user data scoping (2026-08-03)
Followed the landing/auth work: the 8 personal tables (watchlist, saved_filters, positions,
journal_entries, notes, playbook, dashboard_layout, alerts) now carry a nullable indexed
`user_id` (migration 0022). Every personal router endpoint requires `Depends(get_current_user)`
and scopes queries by `user.id`; all update/delete/get-by-id fetch by **id AND user_id**
(IDOR-safe, 404 otherwise). Single-row stores (playbook/dashboard/alerts) became one-row-per-user
via `_get_or_create(db, user_id)`. Services `portfolio.get_analysis` / `portfolio_risk` take an
OPTIONAL `user_id` (unscoped when None) so pure service tests stay untouched; routers always pass
`user.id`. Market/reference data (stocks, metrics, fraud_scores, screener market endpoints,
documents) stays shared/global. Consequence: personal endpoints now 401 without a session even in
dev — the app requires login (AuthGuard handles the redirect). Per-user isolation covered by a
cross-tenant IDOR test on notes.

## Admin panel (waitlist) (2026-08-03)
Admin is bootstrapped via `ADMIN_EMAILS` (comma-separated env) — reconciled onto `User.is_admin`
at register/login (no DB edit needed). `require_admin` dependency gates `/admin/*`
(GET /admin/waitlist, GET /admin/stats → 403 for non-admins). Frontend `/admin` page
(AuthGuard + self-gating on 403) lists waitlist emails + a copy-CSV; the "Quản trị" nav link
in the side bar shows only when /auth/me reports is_admin.

## Giai đoạn 2 — news signals folded into the trust card (2026-08-03)
Closed the Giai đoạn 1↔2 loop at the per-stock level: `ConvictionCard` gains an on-demand
"Tín hiệu tin tức (AI)" pulse (reuses `POST /stocks/{symbol}/news-signals` — AI on explicit
click, scope-safe). Shows net sentiment + dominant events + count; when recent news is
negative AND the forensic overall is elevated_risk/watch, it surfaces a corroboration line
("tin tiêu cực củng cố cảnh báo rủi ro"). Full per-headline list stays in NewsSignalsPanel
below. Frontend-only (no backend change). Business note: keep the research-only positioning —
do NOT rebrand onto tradingdek.com (trading/signal name contradicts the no-advice boundary);
use a clean domain.

## Per-stock foreign flow found (2026-08-03)
The Giai đoạn 2 data gamble paid off: VCI's price-board `getList` exposes per-symbol foreign
buy/sell volume+value + ownership room (see DATA_SOURCES). Shipped `GET /stocks/{symbol}/foreign`
+ `ForeignStockPanel` (a "Khối ngoại" section in the stock detail). Snapshot (latest session),
not history; reuses the VCI WAF handshake; 5-min TTL. The market-level CafeF summary
(`foreign_flow.py`) stays for the dashboard/monitor.
