# V-Investment OS — API Contract (Phase 1)

Base URL (dev): `http://localhost:8000`
All responses use a consistent envelope unless noted.

## Envelope

```jsonc
{
  "success": true,
  "data": <payload | null>,
  "error": <string | null>,
  "meta": <object | null>   // pagination / counts, nullable
}
```

## Types

### StockResult (screener row + table)
```ts
interface StockResult {
  symbol: string;            // "FPT"
  company_name: string;      // "CTCP FPT"
  exchange: "HOSE" | "HNX" | "UPCOM";
  industry: string | null;
  market_cap: number | null;        // tỷ VND (billions)
  close_price: number | null;       // VND
  change_pct: number | null;        // % day change
  pe: number | null;
  pb: number | null;
  roe: number | null;               // %
  roa: number | null;               // %
  net_margin: number | null;        // %  (NPM)
  revenue_growth: number | null;    // % YoY
  eps_growth: number | null;        // % YoY
  debt_equity: number | null;
  current_ratio: number | null;
  dividend_yield: number | null;    // %
  avg_volume_30d: number | null;
  quant_score: number | null;       // 0-100
  quant_grade: string | null;       // "A++","A+","B++","B","C"...
  updated_at: string | null;        // ISO8601
}
```

### StockDetail (right-side preview panel)
Extends StockResult with:
```ts
interface StockDetail extends StockResult {
  charter_capital: number | null;   // Vốn điều lệ (tỷ VND)
  eps_trailing: number | null;      // EPS (Trailing)
  profit_growth: number | null;     // Tăng trưởng LN %
  cash: number | null;              // Tiền mặt (tỷ VND)
  quarterly_profit: { period: string; value: number }[];  // Q/Q growth chart
  ownership: { name: string; pct: number }[];             // Cấu trúc sở hữu
  tags: string[];                   // ["VN30"]
}
```

## Auth (self-hosted JWT, httpOnly cookie)

Private-beta gating. JWT (HS256) in an httpOnly cookie (`vnios_session`); frontend sends `credentials: "include"`, CORS `allow_credentials=true` with explicit origins. When `AUTH_REQUIRED=true` (prod), an `auth_gate` middleware rejects non-public routes without a valid session (public = `/`, `/health`, `/auth/*`, `/waitlist`, `/docs`, `/openapi.json`, `/redoc`). Default off for dev/tests. No per-user data scoping yet (multi-tenancy is a later migration).

- **POST /auth/register** `{email, password, invite_code?}` → sets cookie, `data: {id, email, is_admin}`. `400` bad email/password (min 8 chars); `403` wrong invite code (when `AUTH_INVITE_CODE` set); `409` email taken.
- **POST /auth/login** `{email, password}` → sets cookie, `data: {id,email,is_admin}`. `401` bad credentials (same message whether email exists or not).
- **POST /auth/logout** → clears cookie.
- **GET /auth/me** → `data: {id,email,is_admin}` or `401`.
- **POST /waitlist** `{email, note?}` (public) → `data: {ok, email}`, idempotent per email (no enumeration). `400` bad email.
- **GET /admin/waitlist** (admin only) → `data: [{id,email,note,created_at}]`, newest first. `403` non-admin.
- **GET /admin/stats** (admin only) → `data: {users, waitlist}`. `403` non-admin.

Admin is granted via `ADMIN_EMAILS` (comma-separated) — reconciled onto `is_admin` at register/login; `require_admin` gates the `/admin/*` routes and `/auth/me` reports `is_admin` so the UI shows the admin link.

## Endpoints

### GET /health
`200` → `{ "status": "ok" }` (no envelope)

### GET /stocks
Query: `exchange?`, `industry?`, `limit=50`, `offset=0`
→ `data: StockResult[]`, `meta: { total, limit, offset }`

### GET /stocks/{symbol}
→ `data: StockDetail` | `404` if unknown

### GET /stocks/{symbol}/ohlc?days=120
→ `data: OhlcBar[]` (daily, asc), `meta: { symbol, count }`. `OhlcBar = { time: 'YYYY-MM-DD', open, high, low, close, volume }` (from VCI gap-chart; powers the price chart).

### POST /screener/filter
Body (all optional except none required):
```jsonc
{
  "sector": "Ngân hàng",            // optional
  "exchange": ["HOSE","HNX"],       // optional, default all
  "pe_max": 15,
  "pb_max": 3,
  "roe_min": 15,
  "roa_min": 5,
  "revenue_growth_min": 10,
  "market_cap_min": 1000,           // tỷ VND
  "avg_volume_30d_min": 100000,
  "debt_equity_max": 0.5,
  "dividend_yield_min": 3,
  "exclude_beneish_high_risk": false,      // hide Beneish high-risk symbols
  "exclude_weak_earnings_quality": false,  // hide symbols with weak QoE flag
  "limit": 50,
  "sort_by": "quant_score",         // any StockResult numeric field
  "sort_order": "desc"
}
```
→ `data: StockResult[]`, `meta: { total, filtered, limit }`. Each `StockResult` also carries `beneish_flag`, `earnings_quality_flag`, `earnings_quality_score` (0-100), and `conviction_overall` (solid|mixed|watch|elevated_risk|insufficient) from the latest `fraud_scores` row — the grid shows QoE as a sortable/filterable coloured "CL LN" column and the trust profile as a severity-ranked "Hồ sơ" column. `conviction_overall` here is the market-wide read (forensic + QoE only, no valuation pillar); the per-stock `GET /stocks/{symbol}/conviction` is the richer version.

`meta.total` = universe size (stocks with metrics); `meta.filtered` = full count
matching the filter (not the truncated page length).

### POST /screener/nl
Natural-language → screener filter (research-only; builds a filter, no advice). Body
`{ query }`. Claude maps the description to a validated `ScreenerRequest` (unknown fields
dropped, sector matched to a real industry, exchange/sort/limit validated). `400` empty
query; `503` without `ANTHROPIC_API_KEY`; `502` upstream. → `data: { filter: <partial
ScreenerRequest> }`.

### POST /screener/save
Body: `{ "name": string, "criteria": ScreenerRequest }` → `data: { id, name }`

### GET /screener/saved
→ `data: [{ id, name, criteria }]` (saved screens = named filters)

### DELETE /screener/saved/{id}
→ `data: { id, deleted: true }` | `404`

### GET /screener/sectors
→ `data: string[]` (distinct industries)

### GET /screener/radar?limit=20&with_news=true&with_foreign=true
Signal radar — the Giai đoạn 1→2 bridge. Deterministic (no AI): stocks flagged by the forensic/QoE synthesis (conviction elevated_risk/watch, weak QoE, or high Beneish) from the latest `fraud_scores`, ranked by severity then market cap (capped `limit` 1-40), each with a cheap recent-news overlay (latest headline + count from the RSS relay, concurrent + best-effort; `with_news=false` skips it). Returns `data: [{symbol, company_name, industry, market_cap, conviction_overall, earnings_quality_flag, earnings_quality_score, beneish_flag, altman_em_zone, period, news_count, latest_news:{title,link,published,source}|null, foreign_net}]`. `foreign_net` (tỷ VND, latest-session net foreign buy from the VCI batch price board; `with_foreign=false` skips it, best-effort). Full AI news-signal classification stays per-stock (`POST /stocks/{symbol}/news-signals`). No buy/sell.

### GET /screener/factors
Market-wide factor ranking. → `data: FactorRow[]` sorted by composite desc, `meta: { count }`.
`FactorRow = { symbol, company_name, industry, value, quality, growth, composite }` (0-100;
cross-sectional percentile ranks; null when metrics missing). Momentum omitted.

### GET /screener/compare?symbols=FPT,VCB,MWG
Latest metrics for an ad-hoc symbol set (order preserved, capped 12; unknowns dropped).
→ `data: StockResult[]`, `meta: { requested, found }`. Backs the side-by-side compare view.

### GET /reports/compare.pdf?symbols=FPT,VCB,MWG
Multi-symbol comparison PDF (metric table + per-symbol lenses + fraud screen), rendered
HTML→Chromium. Returns `application/pdf` (attachment). `400` if no symbols.

## Watchlist (per-user — requires login)

`symbols` is stored as a JSON array of strings (upper-cased, de-duped, blanks dropped).

### POST /watchlist
Body: `{ "name": string, "symbols": string[] }` → `data: Watchlist`

### GET /watchlist
→ `data: Watchlist[]` (newest first). `Watchlist = { id, name, symbols, created_at }`

### PUT /watchlist/{id}
Body: `{ "name"?: string, "symbols"?: string[] }` (partial) → `data: Watchlist` | `404`

### DELETE /watchlist/{id}
→ `data: { id, deleted: true }` | `404`

### GET /watchlist/{id}/metrics
→ `data: StockResult[]` (latest metrics for the list's symbols, order preserved),
`meta: { watchlist_id, requested, found }` | `404`

### GET /portfolio/risk
Portfolio risk stats from holdings' OHLC history (research-only, descriptive). →
`data: { available, note, symbols[], metrics:{days, annual_volatility, sharpe,
max_drawdown, var_95}, correlations:[{a,b,corr}] }`. `available:false` + `note` when there
isn't enough price history (metrics fields are fractions: 0.24 = 24%).

## Investment Journal (per-user — requires login)

Personal thesis notes — research only (no positions/quantity/P&L/advice).

### POST /journal
Body: `{ "symbol"?: string, "action": "buy"|"sell"|"watch"|"note", "thesis": string,
"target_price"?: number, "catalyst"?: string }`
→ `data: JournalEntry`. On create, `price_at_entry` is snapshotted from the symbol's
latest close (null if no symbol / no price).

### GET /journal?symbol=FPT
→ `data: JournalEntry[]` (newest first; optional `symbol` filter).
`JournalEntry = { id, symbol, action, thesis, target_price, catalyst, price_at_entry,
status: "open"|"closed", review_note, created_at, updated_at, reviewed_at }`

### PUT /journal/{id}
Body (partial): `{ action?, thesis?, target_price?, catalyst?, status?, review_note? }`.
Setting `review_note` the first time stamps `reviewed_at`. → `data: JournalEntry` | `404`

### DELETE /journal/{id}
→ `data: { id, deleted: true }` | `404`

## Research notes (per-user — requires login)

Free-form timestamped notes, optionally attached to a symbol (simpler than the Journal).

### POST /notes · GET /notes?symbol=FPT · PUT /notes/{id} · DELETE /notes/{id}
POST body `{ symbol?, content }` (content required; symbol trimmed/uppercased, blank→null).
GET filters by `symbol`, newest first. PUT body `{ content }`. →
`data: Note = { id, symbol, content, created_at, updated_at }`.

## Watchlist alerts (per-user — requires login)

Threshold rules over stock metrics — a rule surfaces a FLAG when a metric crosses a
threshold (research-only; no orders/advice).

### GET /alerts · PUT /alerts
Single-row rule list. GET seeds an empty list. PUT body `{ rules: AlertRule[] }` —
normalized (valid symbol/metric/op/value, ids reassigned). →
`data: { rules, metrics: string[], ops: {lt,lte,gt,gte→symbol}, updated_at }`.
`AlertRule = { id, symbol, metric, op: "lt"|"lte"|"gt"|"gte", value, note }`.

### GET /alerts/radar-watch
Followed symbols (every watchlist's symbols ∪ open portfolio positions) currently on the risk radar — deterministic, NO AI/news. Cross-references the latest `fraud_scores` via `signal_radar.flagged_among`. Returns `data: [{symbol, company_name, conviction_overall, earnings_quality_flag, beneish_flag, altman_em_zone, reasons[]}]` ranked by severity, `meta: {followed, flagged}`. Makes the radar proactive: forensic/QoE flags come to the names you follow. No buy/sell.

### GET /alerts/triggered
Rules currently firing, evaluated against the symbols' latest metrics. →
`data: (AlertRule & { current })[]`, `meta: { rules, fired }`.

## BCTC Documents + AI analysis (per-user — requires login)

PDFs stored on local FS (`UPLOAD_DIR`, default `uploads/`); path + analysis JSON in DB.
AI is research-only (extract/summarize, no buy/sell advice). Requires `ANTHROPIC_API_KEY`.

### POST /documents  (multipart/form-data)
Fields: `file` (PDF, ≤ `MAX_UPLOAD_MB`), `symbol?` → `data: DocumentMeta`. `400` non-PDF/oversize.

### GET /documents?symbol=FPT
→ `data: DocumentMeta[]`. `DocumentMeta = { id, symbol, filename, size_bytes, analysis,
analysis_model, uploaded_at, analyzed_at }`; `analysis = { key_figures[], summary,
yoy_changes[], risk_flags[] } | null`.

### GET /documents/{id}/file
→ the PDF (application/pdf) | `404`

### POST /documents/{id}/analyze
Sends the PDF to Claude; stores + returns the analysis. `503` if `ANTHROPIC_API_KEY`
unset; `502` on upstream API error. → `data: DocumentMeta`

### DELETE /documents/{id}
→ `data: { id, deleted: true }` (also removes the file) | `404`

### GET /meta/providers
→ `data: { current, default, options[], sources[] }`. Each source = `{ key, label, host, status: 'ok'|'error'|'unreachable', http_status, latency_ms, detail }` (live reachability probe of VCI + TCBS).

### POST /meta/provider
Body `{ provider: 'resilient'|'vci'|'tcbs'|'fixtures' }` → switches the active provider at runtime (in-memory; resets to .env `DATA_PROVIDER` on restart). `data: { current }`.

### AnalysisResult (extended)
`POST /documents/{id}/analyze` now returns, in addition to `key_figures/summary/yoy_changes/risk_flags`: `multi_year_trend` (years[] + revenue/net_profit/margins/roe/roa/total_debt/equity arrays + note), `asset_structure[]`, `capital_structure[]` ({label,value,pct}), `revenue_breakdown` ({items[],note}), `ratios[]` ({label,value,benchmark}), `cashflow` ({operating,investing,financing}: {net, items[]}), `notes[]`. Numeric values are tỷ VND or %. Frontend derives charts (recharts) from these fields. Empty/`note` when the report lacks the data (no fabrication).

### GET /stocks/{symbol}/backtest?fast=20&slow=50&days=400
Hypothetical SMA(fast)/SMA(slow) hold-vs-flat backtest vs buy-and-hold on OHLC (research-
only, NOT a signal; excludes fees/slippage). → `data: { available, note?, days, fast, slow,
strategy_return, buyhold_return, strategy/buyhold:{annual_volatility,sharpe,max_drawdown},
trades, win_rate, time_in_market, equity:[{i,s,b}] }`. `available:false` when history is thin.

### GET /stocks/{symbol}/lenses
Investment-school criteria checklists (Graham value, Lynch GARP, Quality) over the stock's
metrics — descriptive, no verdict. → `data: InvestmentLens[]`,
`InvestmentLens = { key, name, description, met, total, criteria:[{label, status:
"pass"|"fail"|"na", detail}] }`. `na` criteria are excluded from `total`.

### GET /stocks/{symbol}/technicals?days=200
Technical indicators from OHLC (research-only, descriptive — no signals). →
`data: { available, bars_used, price, sma20, sma50, rsi14, macd:{line,signal,hist},
bollinger:{upper,middle,lower,percent_b,width}, atr14, week52:{high,low,position} }`.
`available:false` when there are <2 usable closes.

### GET /stocks/{symbol}/valuation?exclude_outliers=true
Research-only valuation from the latest analyzed BCTC's multi_year_trend + current metrics (shares = market_cap/price). Earnings-quality filter flags abnormal periods (EPS spike / profit≠operating-cashflow / other-income>30%) and excludes them from the averages (fallback to full series + warning if <2 clean periods). Returns `{current_price, shares_outstanding, methods:{pe_eps_avg,pb_bvps_avg,graham:{value,note}}, valuation_range:{low,high,median}, vs_current_price:{discount_pct,interpretation}, earnings_quality:{outliers_detected,fallback_used,note,periods_used}}`. No buy/sell advice.

### POST /stocks/{symbol}/news-signals?force=false
Giai đoạn 2 (signals): classify recent per-stock headlines (`news.symbol_news`, Google-News RSS) into structured signals via the LLM — runs only on this explicit call (a panel button), 30-min TTL cache per symbol (`force=true` bypasses). Returns `{available, symbol, analyzed_count, signals:[{headline, event_type, sentiment: positive|negative|neutral, extract, published, source, link}], summary:{net_sentiment: positive|negative|mixed|neutral, dominant_events[], note}}` — `available:false` + `note` when no news. `event_type ∈ {business_update, earnings, dividend, capital_raise, insider_shareholder, management, mna, regulatory_legal, macro_sector, other}`. Sentiment = reading of the news content (not advice); news treated as unverified; link/source/published are authoritative (from the RSS item, never the model). `503` without `ANTHROPIC_API_KEY`; `502` upstream/parse. No buy/sell.

### GET /stocks/{symbol}/foreign
Per-stock foreign (khối ngoại) flow for the latest session, from the VCI price board (`POST trading…/api/price/symbols/getList`, `matchPrice` block). Returns `{available, symbol, buy_vol, sell_vol, net_vol (shares), buy_val, sell_val, net_val (tỷ VND, >0 = mua ròng), current_room, total_room (shares), room_used_pct}`; `available:false` + `note` when VCI is unreachable / no data. 5-min TTL cache. Descriptive, no advice.

### GET /stocks/{symbol}/conviction
Financial-trust profile — deterministic (NO AI) synthesis of the Giai đoạn 1 signals: forensic (Beneish/Altman Z''/Piotroski from `fraud_api`) + Quality of Earnings + sector-relative valuation. Returns `{symbol, overall: solid|mixed|watch|elevated_risk|insufficient, overall_text, pillars:[{key,label,status: good|neutral|risk|unknown,headline}], flag_counts:{good,neutral,risk,unknown}, cross_signals[], sources:{forensic,sector_valuation}, disclaimer}`. `cross_signals` surfaces where independent signals CORROBORATE (e.g. weak QoE + high Beneish). Never a single numeric rating, never buy/sell. `success:false` when neither the forensic scores nor the sector valuation are available.

### GET /stocks/{symbol}/valuation/sector
Relative (comparable-multiples) valuation vs same-industry peers — reuses `peers.industry_benchmark` medians; needs only current metrics (no BCTC/history). For P/E and P/B: fair value if the stock reverted to the sector-median multiple (`price × sector_median ÷ own`), plus its premium/discount to that median. **No margin of safety** (descriptive relative estimate, not a safe-buy price). Returns `{industry, peer_count, current_price, methods:{pe_relative,pb_relative:{value,own_multiple,sector_multiple,premium_pct,note}}, valuation_range:{low,high,median}, vs_current_price:{discount_pct,interpretation}, relative_position, avg_premium_pct, notes[]}`. `notes` flags a thin peer set (<3) and financial-sector P/E caveats. `premium_pct`>0 = pricier than peers. No buy/sell.

### POST /stocks/{symbol}/valuation/dcf
Body `{growth_rate, discount_rate(=13), years(=5)}` → simplified DCF on real operating cash flow (Gordon terminal). Returns `{dcf_value, assumptions_used, sensitivity_note}`.

### Price chart
Frontend renders `GET /stocks/{symbol}/ohlc` via `@tradecanvas/chart` (canvas OHLC engine; trading/alerts features disabled for research-only). `OHLCBar.time` is unix-ms — frontend converts `YYYY-MM-DD` → ms.

### GET /stocks/{symbol}/compass
Investment Compass (research-only composite scores, 3 horizons). Reuses valuation + earnings-quality filter + multi_year_trend + OHLC + metrics — no recomputation. Returns `{disclaimer, short_term, mid_term, long_term:{score 0-100|null, breakdown{}, explanation[]}, data_gaps[]}`. short=momentum(technical .4/valuation_relative .3/catalyst .3); mid=growth_consistency .5 (clean periods only)/valuation_fair .5; long=financial_quality 1.0 (dividend history absent → weight 0 + data_gap). Missing component → null + weight redistributed + listed in data_gaps. No buy/sell language.

### GET /screener/compass-scores?symbols=A,B,C
Precomputed Compass badge scores (DB read, NO AI). Returns `{SYM: {short,mid,long,computed_at}}` only for symbols with a cached row (analyzed BCTC); others omitted → badge shows "—". Cache is written when a BCTC is analyzed or its compass detail is viewed (only when mid/long are computable).

### Screener table — bo-grid
Frontend renders the screener with the `bo-grid` web component (pagination via `pageSize`, virtualization, sorting, filter menu, native tooltips). Compass scores shown as colorScale-tinted columns; Quant as a progress column; row-click opens detail; right-click row menu toggles watchlist. `POST /screener/filter` `limit` raised to max 2000 so the grid can page through the full matched set (was capped at 50).

### GET /stocks/{symbol}/peers
Peer/industry comparison (research-only). For each metric (pe,pb,roe,roa,net_margin,debt_equity), distribution across same-industry peers' latest metrics: `{value, median, p25, p75, min, max, percentile, n, higher_is_better}`. Returns `{industry, peer_count, metrics[]}`. Neutral numbers, no buy/sell.

### GET /stocks/{symbol}/fraud-scores
Algorithmic forensic screen (pure math, recomputed live from stored `financial_statements`; needs ≥2 annual periods else 404/null). Returns `{symbol, period, beneish:{score,flag,interpretation,variables_used,top_contributors[]}, altman:{score,zone,interpretation,model,original{}}, piotroski:{score,max_score,criteria[]}, earnings_quality:{score 0-100|null, flag strong|adequate|weak|insufficient_data, interpretation, components_used, components[{name,value,sub_score,meaning}]}, disclaimer}`. **earnings_quality** (QoE) isolates cash-vs-accrual quality via 4 heuristic-banded components (accruals/Sloan, cash_conversion OCF÷NI, receivables-vs-revenue growth, gross-margin trend); higher = better; a dropped component (missing data) lowers `components_used`. Screening signal, never a fraud verdict — no buy/sell.

### GET /playbook · PUT /playbook
Single-row personal investment playbook (markdown process notes). GET seeds the default 4-tier content on first call. PUT body `{content}` updates it. `{content, updated_at}`.

## AI research assistant (research-only)

Grounded Q&A over the app's own data. AI runs only on an explicit question; the model
explains/compares numbers and never recommends (no buy/sell/hold/target). Reuses
`ANTHROPIC_API_KEY`.

### GET /assistant/status
→ `data: { configured: bool }` (key present?). Lets the UI show a setup note without a failed call.

### POST /assistant/ask
Body `{ question: string, symbol?: string, history?: {role,content}[] }`. Assembles grounding
context for the symbol (metrics + fraud/strength scores + Compass + peer comparison) and asks
Claude; `history` (prior turns, capped ~3 exchanges) enables follow-ups. `400` empty question;
`503` if `ANTHROPIC_API_KEY` unset; `502` on upstream error.
→ `data: { answer, symbol, sources: string[], model, disclaimer }`.

## Terminal — global markets + dashboard (research-only)

Global-context connectors (Fincept-style aggregation of free/public sources) and the
terminal HOME layout. See `DATA_SOURCES.md`. Neutral numbers, no advice.

### GET /markets/world?force=false
World indices / commodities / FX / crypto snapshot from Yahoo (cached ~60s).
→ `data: WorldQuote[]`, `meta: { count, source: "yahoo" }`.
`WorldQuote = { symbol, name, group, price, prev_close, change, change_pct, currency }`
(numeric fields nullable; `change/change_pct` null when the previous close is absent/zero).

### GET /markets/crypto?force=false
Crypto basket from CoinGecko. → `data: CryptoQuote[]`, `meta: { count, source: "coingecko" }`.
`CryptoQuote = { symbol, name, price, change_pct, market_cap }` (24h change; nullable).

### GET /markets/fx?force=false
Major FX pairs (USD/VND first) from Yahoo. → `data: WorldQuote[]`,
`meta: { count, source: "yahoo" }` (same `WorldQuote` shape, `group = "Tiền tệ"`).

### GET /markets/commodities?force=false
Commodities basket (gold/silver/copper/WTI/Brent/natural gas) from Yahoo.
→ `data: WorldQuote[]`, `meta: { count, source: "yahoo" }` (`group = "Hàng hóa"`).

### GET /markets/macro?force=false
Global macro series (latest value) from FRED. Requires `FRED_API_KEY` — without it returns
`data: []` and `meta.note` (no error). → `data: MacroPoint[]`,
`meta: { count, source: "fred", configured: bool, note: string|null }`.
`MacroPoint = { series_id, name, unit, value, date }`.

### GET /markets/worldbank?force=false
Vietnam country macro (GDP growth, inflation, unemployment, exports/GDP, FDI/GDP) from the
World Bank (no key). → `data: WbPoint[]`, `meta: { count, source: "worldbank", country: "VNM" }`.
`WbPoint = { indicator, name, unit, value, date }`.

### GET /markets/dbnomics?force=false
Vietnam IMF-WEO macro (GDP growth, CPI, unemployment, govt debt %GDP, current account
%GDP) via DBnomics (no key). Newest value ≤ current year (WEO also holds projections).
→ `data: DbnPoint[]`, `meta: { count, source: "dbnomics", release }`.
`DbnPoint = { code, name, unit, value, period }` (period = WEO year).

### GET /markets/asean?force=false
Vietnam vs ASEAN peers (VNM/THA/IDN/PHL/MYS/SGP) on GDP growth, ranked high→low (nulls last).
→ `data: AseanPoint[]`, `meta: { count, source: "worldbank", indicator: "GDP growth %" }`.
`AseanPoint = { country, name, value, date }`.

### GET /markets/foreign?force=false
Market-level foreign (khối ngoại) summary for the latest day from CafeF (cached ~30m). →
`data: { available, note?, date, index, buy_vol, sell_vol, buy_val, sell_val, net_val,
pct_buy_val, pct_sell_val }` (values in tỷ VND; `net_val>0` = net foreign buy).
`available:false` on fetch failure. No per-stock leaderboard (CafeF ignores PageIndex).

### GET /markets/movers
VN market pulse from the latest metrics. → `data: { gainers, losers, most_active, breadth,
change_available }`. `gainers/losers/most_active` are `MoverRow[]` (each also carries `foreign_net` — latest-session net foreign buy in tỷ VND, overlaid from the VCI batch price board, best-effort)
(`{symbol, company_name, close_price, change_pct, avg_volume_30d}`); `breadth` =
`{advancers, decliners, unchanged, total}`. Empty gainers/losers + `change_available:false`
until the daily price sync populates `change_pct`.

### GET /markets/vn-indices
Latest VN-Index / VN30 / HNX level + day change from synced `index_bars`. Empty until synced
(`POST /analytics/sync-index`). → `data: VnIndex[]`, `meta: { count }`.
`VnIndex = { symbol, name, level, change_pct, as_of }`.

### GET /news/channels · GET /news/channel/{key}
Multi-source news channels. `/channels` → `[{ key, label }]` (`vn`/`world`/`macro`).
`/channel/{key}` → `NewsItem[]` aggregated + deduped across that channel's RSS feeds
(headline relay, research-only). Complements the VN `/news/market|symbol|personalized`.

### GET /meta/connectors
Global-market connector registry. → `data: Connector[]`, `meta: { count }`.
`Connector = { key, label, source, domain, requires_key, configured }`.
Keys: `world | fx | commodities | crypto | macro | worldbank | dbnomics | asean | news`.

### GET /meta/connectors/health
Live reachability probe of each connector. → `data: ConnectorHealth[]`, `meta: { count }`.
`ConnectorHealth = { key, label, host, status: "ok"|"error"|"unreachable"|"not_configured",
http_status, latency_ms, detail }` (FRED is `not_configured` without a key — no network call).

### GET /dashboard/layout · PUT /dashboard/layout
Single-user terminal HOME layout (which tiles show + order). GET seeds the default order on
first call. PUT body `{ tiles: string[] }` — normalized to known keys, de-duped, order kept
(a valid empty list hides every tile). → `data: { tiles, allowed, updated_at }`.
Tile keys: `world | fx | commodities | movers | watchlist | crypto | macro | worldbank | dbnomics | asean | news | sectorheat | pulse`.
