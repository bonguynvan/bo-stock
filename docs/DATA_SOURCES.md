# Data Sources

Canonical reference for where market data comes from. Portable (lives in the repo).

## Provider strategy

The backend uses a **pluggable provider** layer (`backend/app/services/providers/`) selected
by `DATA_PROVIDER`:

- `resilient` (default) — tries **VCI → TCBS**, per-method fallback (failure or empty result
  drops to the next provider).
- `vci` — Vietcap. **Maintained, primary, reachable from outside Vietnam.**
- `tcbs` — legacy fallback. **Geo-blocked to Vietnam** (see below).
- `fixtures` — bundled sample data for offline pipeline verification (`--fixtures`).

## VCI (Vietcap) — primary

Reachable without a VN IP. **Quirks:**
- **Handshake first:** `GET https://trading.vietcap.com.vn/priceboard` to set session cookies,
  then reuse the same client/cookies for IQ-service calls.
- Send a **browser User-Agent** + `Referer`/`Origin: https://trading.vietcap.com.vn`.
- **WAF throttles bursts** → returns an HTML "Error Page" after rapid repeats. Use one shared
  client, a per-second rate limiter, and modest concurrency.
- Numeric ratios are **fractions** (`roe: 0.285` = 28.5%). Scale ×100 for roe/roa/margins/divYield
  (helper keeps a `|v|<=1.5` guard so it's safe if VCI ever switches to percent).
- `marketCap` is **absolute VND** → divide by 1e9 for tỷ VND.

| Need | Method + URL | Key fields |
|---|---|---|
| Listing (~1745) | `GET trading…/api/price/symbols/getAll` | `symbol`, `board` (**HSX = HOSE**), `type` (filter `STOCK`), `organShortName`, `organName`, `icbCode2` |
| Ratios | `GET iq…/v1/company/{S}/statistics-financial` | wide rows, `ratioType` `RATIO_TTM`/`RATIO_YEAR`; `pe pb ps roe roa afterTaxProfitMargin grossMargin currentRatio quickRatio debtToEquity dividendYield evToEbitda marketCap year/yearReport/quarter` |
| Price + industry + name + mcap | `GET iq…/v1/company/details?ticker={S}` | `currentPrice`, `marketCap`, `sectorVn` (industry), `viOrganShortName`, `comGroupCode`, `foreignerPercentage`, `statePercentage` |
| Ownership | `GET iq…/v1/company/{S}/shareholder-structure` | `statePercentage foreignPercentage bodPercentage institutionPercentage otherPercentage` (all fractions) |
| Sectors map | `GET iq…/v1/sectors/icb-codes` | `name` (ICB code), `viSector`, `icbLevel` |
| Day-change / history | `POST trading…/api/chart/OHLCChart/gap-chart` | OHLC bars → last vs prev close |
| Income statement (EPS/growth/Q-profit) | `GET iq…/v1/company/{S}/financial-statement` | quarterly net profit, EPS |

Base hosts: `iq… = https://iq.vietcap.com.vn/api/iq-insight-service`,
`trading… = https://trading.vietcap.com.vn/api`.

**Not available from the ratio endpoint:** price, day-change, EPS, revenue/EPS growth,
ownership — these come from `details` / `shareholder-structure` / income statement instead.

**Derived / mapped fields (Phase 4):**
- **Day-change %**: `gap-chart` POST `{timeFrame:"ONE_DAY", symbols:[S], to:<epoch>, countBack:2}`
  → `(c[-1]-c[-2])/c[-2]`. Illiquid stocks can show large swings (prev close may be an old session).
- **Trailing EPS**: derived `close_price / pe` (VCI ratio has no EPS field).
- **Quarterly net profit + YoY growth**: income statement uses **opaque line codes** (`isa*`,
  `isb*`…) that differ by company type. We resolve the net-profit code per company via the field
  dictionary (`…/financial-statement/metrics?section=INCOME_STATEMENT`), matching the title
  *"attributable to parent company"* (fallback *"net profit after tax"*). Detail-panel only.
- **Still "—":** charter capital, cash (balance-sheet codes — not yet mapped).

## TCBS — legacy fallback

`https://apipubaws.tcbs.com.vn`. **Geo-restricted to Vietnam** — every path returns
`404 {"status":404,"message":"Service not found"}` from non-VN IPs (confirmed even with the
sandbox disabled; remote fetchers like r.jina.ai get the same 404). Run TCBS-specific checks
from a VN IP. Endpoint paths (verified vs vnstock v3.2.7):
- Listing: `/stock-insight/v1/stock/listing`
- Ratios: `/tcanalysis/v1/finance/{S}/financialratio?yearly=0&isAll=false` (fields `priceToEarning priceToBook roe roa postTaxMargin grossProfitMargin debtOnEquity earningPerShare year quarter`)
- Overview: `/tcanalysis/v1/ticker/{S}/overview`

## VN index bars — KBS

VN-Index / VN30 / HNX-Index daily bars (for the top index tape + Analytics market backdrop).
**Reachable outside VN** (not geo-blocked). Source: KBS
`GET https://kbbuddywts.kbsec.com.vn/iis-server/investment/index/{SYMBOL}/data_day?sdate=&edate=`
→ newest-first daily OHLCV (values mixed str/number). Symbols: `VNINDEX`, `VN30`, `HNXINDEX`.
Persisted to the `index_bars` table; surfaced via `GET /markets/vn-indices` (latest level +
day change) and synced by `POST /analytics/sync-index`. Pure parsers unit-tested.

## Global-market connectors — terminal context (Fincept-style aggregation)

Free/public sources aggregated for the terminal's **global context** panels. This is a
*different data domain* than VN equity metrics, so it lives outside the VCI→TCBS chain
(`services/world_markets.py`, `crypto.py`, `macro.py`). Research-only: neutral last price /
change — no advice.

| Connector | Source | Auth | Endpoint | Serves |
|---|---|---|---|---|
| World markets | Yahoo Finance | none | `GET query1.finance.yahoo.com/v8/finance/chart/{sym}` (needs browser UA) | `GET /markets/world` — indices (S&P/Nasdaq/Dow/Nikkei/HSI/FTSE), gold, WTI, DXY, BTC |
| Forex (FX) | Yahoo Finance | none | same chart endpoint, FX symbols (`VND=X`, `EURUSD=X`, `JPY=X`, `CNY=X`, `GBPUSD=X`) | `GET /markets/fx` — USD/VND, EUR/USD, USD/JPY, USD/CNY, GBP/USD |
| Commodities | Yahoo Finance | none | same chart endpoint, futures (`GC=F`, `SI=F`, `HG=F`, `CL=F`, `BZ=F`, `NG=F`) | `GET /markets/commodities` — gold, silver, copper, WTI, Brent, natural gas |
| Crypto | CoinGecko | none | `GET api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=…` | `GET /markets/crypto` — price + 24h change + market cap |
| Macro (global) | FRED | **free key** (`FRED_API_KEY`) | `GET api.stlouisfed.org/fred/series/observations?series_id=…` | `GET /markets/macro` — US 10Y, Fed Funds, unemployment, VIX, Brent, broad USD |
| Macro (Vietnam) | World Bank | none | `GET api.worldbank.org/v2/country/VNM/indicator/{id}?format=json&mrv=5` | `GET /markets/worldbank` — GDP growth, inflation, unemployment, exports/GDP, FDI/GDP |
| ASEAN compare | World Bank | none | same, per country (`VNM/THA/IDN/PHL/MYS/SGP`) on GDP growth | `GET /markets/asean` — VN vs ASEAN peers, ranked |
| News (RSS) | CafeF/Vietstock/CNBC/MarketWatch/Investing | none | RSS feeds by channel (`vn`/`world`/`macro`) | `GET /news/channels`, `GET /news/channel/{key}` — headline relay, deduped |
| IMF WEO (DBnomics) | DBnomics (IMF WEO) | none | `GET api.db.nomics.world/v22/series/IMF/{release}/VNM.{indicator}.{unit}` | `GET /markets/dbnomics` — VN GDP/CPI/unemployment/debt/current-account (IMF estimates; release code `WEO:2025-04` bumps ~twice/yr) |
| Foreign flow (khối ngoại) | CafeF | none | `GET s.cafef.vn/Ajax/PageNew/DataHistory/GDKhoiNgoai.ashx` → `Data.TradingReport` | `GET /markets/foreign` — **market-level** foreign buy/sell/net + % of market (latest day). ⚠️ `PageIndex` is ignored (no per-stock leaderboard); per-symbol series needs another source |

- **Caching:** world/fx/crypto ~60s TTL, macro ~1h, World Bank ~6h (values move slowly). One
  bad symbol never sinks a panel (per-symbol try/except).
- **Macro without a key:** `GET /markets/macro` returns `[]` + `meta.note` (graceful), and the
  registry reports `macro.configured = false`.
- **Connector registry:** `GET /meta/connectors` lists each connector with `source`,
  `requires_key`, `configured` (mirrors Fincept's connector model).
- **Live health:** `GET /meta/connectors/health` probes each connector's host (status +
  latency), reusing `connectivity._probe`; FRED reports `not_configured` without a key. Surfaced
  in the **Connectors** hub view.

## Gotcha: vnstock schema ≠ raw API

The `vnstock` library's published "ratio" schema (long-format `item`/`item_id`/`2026-Q1`…)
is its **transformed DataFrame output**, NOT the raw API. The raw VCI `statistics-financial`
response is **wide-format** period records with camelCase keys. Always parse the raw shape.

## Scope reminder

We do **not** surface VCI's advisory fields (`rating` BUY/SELL, `targetPrice`,
`projectedTSRPercentage`, `upsideToTargetPercent`). Research-only — see `DECISIONS.md`.

## Per-stock foreign flow (khối ngoại) — VCI price board (found 2026-08-03)
`POST https://trading.vietcap.com.vn/api/price/symbols/getList` body `{"symbols":[...]}`
(after the usual GET `/priceboard` WAF handshake) returns per symbol
`{listingInfo, bidAsk, matchPrice}`. **matchPrice** carries the foreign fields:
`foreignBuyVolume`, `foreignSellVolume` (shares), `foreignBuyValue`, `foreignSellValue`
(VND), `currentRoom` (shares foreign can still buy), `totalRoom` (shares). Latest session
only (snapshot, not history). This is the per-stock foreign source — CafeF's GDKhoiNgoai
only exposes a market-level total (PageIndex ignored). Batchable (many symbols per call).
Endpoint `GET /stocks/{symbol}/foreign` (`services/foreign_stock.py`, pure `parse_getlist`).

## Per-stock proprietary-desk flow (tự doanh) — CafeF (found 2026-08-10)
`GET https://cafef.vn/du-lieu/ajax/pagenew/datahistory/gdtudoanh.ashx?Symbol={S}&StartDate=&EndDate=&PageIndex=1&PageSize={n}`
returns `Data.Data.ListDataTudoanh[]` — a **daily time series** of securities-firm
self-trading: per row `Symbol`, `Date` (dd/MM/yyyy), `KLcpMua`/`KlcpBan` (shares buy/sell),
`GtMua`/`GtBan` (VND buy/sell). Net value = `(GtMua − GtBan)/1e9` tỷ VND (>0 = tự doanh
mua ròng). We keep the latest session — a second organizational-flow lens beside khối ngoại.
⚠️ **Host matters:** the `s.cafef.vn/Ajax/PageNew/DataHistory/GDTuDoanh.ashx` alias
301-redirects to the canonical `cafef.vn/du-lieu/...` and **drops the query string** →
`{"Message":"symbol is null or empty","Success":false}`. Hit the canonical host directly.
Endpoints `GET /stocks/{symbol}/prop-trading` + overlay on radar/movers (`prop_net`);
`services/prop_trading.py`, pure `parse_tudoanh`. Found via `gh search code GDTuDoanh`.
This is the free-public tự doanh source (NOT via the paid `vnstock_data` gateway).

## Per-stock insider transactions (giao dịch nội bộ) — VCI iq-insight (found 2026-08-11)
`GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/company/{S}/insider-transaction`
(after the usual GET `/priceboard` WAF handshake; response is br/gzip — httpx decodes it)
returns `data.content[]` of filed insider deals: `publicDate`, `startDate`/`endDate`,
`traderNameVi` + `traderPositionVi`, `actionTypeVi` (Mua/Bán/Thưởng), `tradeStatusVi`
("Đã thực hiện xong"=done / "Đăng ký"=registered), `shareRegister` (registered qty),
**`shareAcquire` = SIGNED transacted qty (Mua +, Bán −)**, `ownershipAfterTrade` (fraction),
`eventCode` (DDIND/DDINS/DDRP), `sourceUrlVi`. Summing completed Mua/Bán `shareAcquire`
over a window = net insider direction. **This is our reachable primary — TCBS's insider
API is Cloudflare-challenged and CafeF has no clean insider `.ashx`; VCI solved B2 with no
headless render.** Endpoint `GET /stocks/{symbol}/insider`; `services/insider.py`, pure
`parse_insider` + `summarize_insider`. Found by probing VCI iq paths (insider-transaction
→ 200; insider-dealing/leadership/etc → 404).
