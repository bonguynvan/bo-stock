import type {
  ApiEnvelope,
  DocumentMeta,
  GetStocksParams,
  OhlcBar,
  ProvidersStatus,
  Valuation,
  SectorValuation,
  ConvictionProfile,
  NewsSignals,
  SymbolForeign,
  SymbolProp,
  SymbolInsider,
  DcfParams,
  DcfResult,
  Compass,
  CompassScoresMap,
  PeerComparison,
  Playbook,
  JournalCreateBody,
  JournalEntry,
  JournalUpdateBody,
  SavedScreen,
  ScreenerFilterBody,
  ScreenerMeta,
  ScreenerResponse,
  SectorsOverview,
  QualityPicks,
  AvailableReports,
  ConsiderationSummary,
  FraudScores,
  ResearchQuestion,
  ResearchSearchResult,
  PortfolioAnalysis,
  NewsItem,
  Analytics,
  StockDetail,
  StockResult,
  StocksMeta,
  StocksResponse,
  Watchlist,
  WorldQuote,
  CryptoQuote,
  MacroPoint,
  WbPoint,
  AseanPoint,
  NewsChannel,
  MoversData,
  ForeignSummary,
  Technicals,
  DbnPoint,
  PortfolioRisk,
  AlertsConfig,
  AlertRule,
  TriggeredAlert,
  Note,
  InvestmentLens,
  Backtest,
  FactorRow,
  RadarItem,
  RadarCoverage,
  RadarResult,
  RadarWatchItem,
} from "@/types/stock";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Parse the standard {success,data,error,meta} envelope.
 * Throws ApiError on success:false or non-OK HTTP status.
 */
async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }

  if (!res.ok) {
    // FastAPI HTTPException uses { detail }; our envelope uses { error }.
    const detail = (body as { detail?: string } | null)?.detail;
    const message = body?.error ?? detail ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }
  if (!body) {
    throw new ApiError("Empty or invalid response body", res.status);
  }
  if (!body.success) {
    throw new ApiError(body.error ?? "Request was not successful", res.status);
  }
  return body;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    throw new ApiError(`Không thể kết nối tới máy chủ API: ${detail}`, 0);
  }
  return parseEnvelope<T>(res);
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function getStocks(params: GetStocksParams = {}): Promise<StocksResponse> {
  const query = buildQuery({
    exchange: params.exchange,
    industry: params.industry,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
  const body = await request<StockResult[]>(`/stocks${query}`);
  return {
    data: body.data ?? [],
    meta: (body.meta as unknown as StocksMeta | null) ?? null,
  };
}

// --- Data sources (Settings) ---

export async function getProvidersStatus(): Promise<ProvidersStatus> {
  const body = await request<ProvidersStatus>("/meta/providers");
  return body.data as ProvidersStatus;
}

export async function setProvider(provider: string): Promise<string> {
  const body = await request<{ current: string }>("/meta/provider", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
  return (body.data as { current: string }).current;
}

export async function getWorldMarkets(): Promise<WorldQuote[]> {
  const body = await request<WorldQuote[]>("/markets/world");
  return body.data ?? [];
}

export async function getCryptoMarkets(): Promise<CryptoQuote[]> {
  const body = await request<CryptoQuote[]>("/markets/crypto");
  return body.data ?? [];
}

export interface VnIndex {
  symbol: string;
  name: string;
  level: number | null;
  change_pct: number | null;
  as_of: string | null;
}

export async function getVnIndices(): Promise<VnIndex[]> {
  const body = await request<VnIndex[]>("/markets/vn-indices");
  return body.data ?? [];
}

export async function getMovers(): Promise<MoversData> {
  const body = await request<MoversData>("/markets/movers");
  return body.data as MoversData;
}

export async function getForeignFlow(): Promise<ForeignSummary> {
  const body = await request<ForeignSummary>("/markets/foreign");
  return body.data as ForeignSummary;
}

export interface DashboardLayout {
  tiles: string[];
  allowed: string[];
  updated_at: string | null;
}

export async function getDashboardLayout(): Promise<DashboardLayout> {
  const body = await request<DashboardLayout>("/dashboard/layout");
  return body.data as DashboardLayout;
}

export async function updateDashboardLayout(tiles: string[]): Promise<DashboardLayout> {
  const body = await request<DashboardLayout>("/dashboard/layout", {
    method: "PUT",
    body: JSON.stringify({ tiles }),
  });
  return body.data as DashboardLayout;
}

export async function getFxMarkets(): Promise<WorldQuote[]> {
  const body = await request<WorldQuote[]>("/markets/fx");
  return body.data ?? [];
}

export async function getWorldBank(): Promise<WbPoint[]> {
  const body = await request<WbPoint[]>("/markets/worldbank");
  return body.data ?? [];
}

export async function getCommodities(): Promise<WorldQuote[]> {
  const body = await request<WorldQuote[]>("/markets/commodities");
  return body.data ?? [];
}

export async function getDbnomics(): Promise<DbnPoint[]> {
  const body = await request<DbnPoint[]>("/markets/dbnomics");
  return body.data ?? [];
}

export async function getAseanGdp(): Promise<AseanPoint[]> {
  const body = await request<AseanPoint[]>("/markets/asean");
  return body.data ?? [];
}

export interface AssistantAnswer {
  answer: string;
  symbol: string | null;
  sources: string[];
  model: string;
  disclaimer: string;
}

export async function getAssistantStatus(): Promise<boolean> {
  const body = await request<{ configured: boolean }>("/assistant/status");
  return (body.data as { configured: boolean })?.configured ?? false;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export async function askAssistant(
  question: string,
  symbol?: string,
  history?: AssistantTurn[],
): Promise<AssistantAnswer> {
  const body = await request<AssistantAnswer>("/assistant/ask", {
    method: "POST",
    body: JSON.stringify({ question, symbol: symbol || null, history: history ?? null }),
  });
  return body.data as AssistantAnswer;
}

export async function getCompare(symbols: string[]): Promise<StockResult[]> {
  if (symbols.length === 0) return [];
  const qs = encodeURIComponent(symbols.join(","));
  const body = await request<StockResult[]>(`/screener/compare?symbols=${qs}`);
  return body.data ?? [];
}

export async function getNewsChannels(): Promise<NewsChannel[]> {
  const body = await request<NewsChannel[]>("/news/channels");
  return body.data ?? [];
}

export async function getChannelNews(channel: string): Promise<NewsItem[]> {
  const body = await request<NewsItem[]>(`/news/channel/${encodeURIComponent(channel)}`);
  return body.data ?? [];
}

export interface Connector {
  key: string;
  label: string;
  source: string;
  domain: string;
  requires_key: boolean;
  configured: boolean;
}

export async function getConnectors(): Promise<Connector[]> {
  const body = await request<Connector[]>("/meta/connectors");
  return body.data ?? [];
}

export interface ConnectorHealth {
  key: string;
  label: string;
  host: string;
  status: "ok" | "error" | "unreachable" | "not_configured";
  http_status: number | null;
  latency_ms: number | null;
  detail: string;
}

export async function getConnectorsHealth(): Promise<ConnectorHealth[]> {
  const body = await request<ConnectorHealth[]>("/meta/connectors/health");
  return body.data ?? [];
}

export interface MacroResponse {
  points: MacroPoint[];
  configured: boolean;
  note: string | null;
}

export async function getMacro(): Promise<MacroResponse> {
  const body = await request<MacroPoint[]>("/markets/macro");
  const meta = (body.meta ?? {}) as { configured?: boolean; note?: string | null };
  return {
    points: body.data ?? [],
    configured: meta.configured ?? false,
    note: meta.note ?? null,
  };
}

export async function getNotes(symbol?: string): Promise<Note[]> {
  const body = await request<Note[]>(`/notes${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`);
  return body.data ?? [];
}

export async function createNote(content: string, symbol?: string): Promise<Note> {
  const body = await request<Note>("/notes", {
    method: "POST",
    body: JSON.stringify({ content, symbol: symbol || null }),
  });
  return body.data as Note;
}

export async function deleteNote(id: number): Promise<void> {
  await request(`/notes/${id}`, { method: "DELETE" });
}

export async function getAlerts(): Promise<AlertsConfig> {
  const body = await request<AlertsConfig>("/alerts");
  return body.data as AlertsConfig;
}

export async function updateAlerts(rules: AlertRule[]): Promise<AlertsConfig> {
  const body = await request<AlertsConfig>("/alerts", {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
  return body.data as AlertsConfig;
}

export async function getTriggeredAlerts(): Promise<TriggeredAlert[]> {
  const body = await request<TriggeredAlert[]>("/alerts/triggered");
  return body.data ?? [];
}

export async function getPortfolioRisk(): Promise<PortfolioRisk> {
  const body = await request<PortfolioRisk>("/portfolio/risk");
  return body.data as PortfolioRisk;
}

export async function getBacktest(
  symbol: string,
  fast = 20,
  slow = 50,
): Promise<Backtest> {
  const body = await request<Backtest>(
    `/stocks/${encodeURIComponent(symbol)}/backtest?fast=${fast}&slow=${slow}`,
  );
  return body.data as Backtest;
}

export async function getLenses(symbol: string): Promise<InvestmentLens[]> {
  const body = await request<InvestmentLens[]>(`/stocks/${encodeURIComponent(symbol)}/lenses`);
  return body.data ?? [];
}

export async function getTechnicals(symbol: string, days = 200): Promise<Technicals> {
  const body = await request<Technicals>(
    `/stocks/${encodeURIComponent(symbol)}/technicals?days=${days}`,
  );
  return body.data as Technicals;
}

export async function getOhlc(symbol: string, days = 120): Promise<OhlcBar[]> {
  const body = await request<OhlcBar[]>(
    `/stocks/${encodeURIComponent(symbol)}/ohlc?days=${days}`,
  );
  return body.data ?? [];
}

export async function getPlaybook(): Promise<Playbook> {
  const body = await request<Playbook>("/playbook");
  return body.data as Playbook;
}

export async function savePlaybook(content: string): Promise<Playbook> {
  const body = await request<Playbook>("/playbook", {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
  return body.data as Playbook;
}

export async function getCompassScores(symbols: string[]): Promise<CompassScoresMap> {
  if (symbols.length === 0) return {};
  const body = await request<CompassScoresMap>(
    `/screener/compass-scores?symbols=${encodeURIComponent(symbols.join(","))}`,
  );
  return (body.data as CompassScoresMap) ?? {};
}

export async function getPeers(symbol: string): Promise<PeerComparison> {
  const body = await request<PeerComparison>(`/stocks/${encodeURIComponent(symbol)}/peers`);
  return body.data as PeerComparison;
}

export async function getCompass(symbol: string): Promise<Compass> {
  const body = await request<Compass>(`/stocks/${encodeURIComponent(symbol)}/compass`);
  return body.data as Compass;
}

export async function getValuation(
  symbol: string,
  excludeOutliers = true,
): Promise<Valuation> {
  const body = await request<Valuation>(
    `/stocks/${encodeURIComponent(symbol)}/valuation?exclude_outliers=${excludeOutliers}`,
  );
  return body.data as Valuation;
}

export async function postNewsSignals(symbol: string, force = false): Promise<NewsSignals> {
  const body = await request<NewsSignals>(
    `/stocks/${encodeURIComponent(symbol)}/news-signals?force=${force}`,
    { method: "POST" },
  );
  return body.data as NewsSignals;
}

export async function getSymbolForeign(symbol: string): Promise<SymbolForeign> {
  const body = await request<SymbolForeign>(`/stocks/${encodeURIComponent(symbol)}/foreign`);
  return body.data as SymbolForeign;
}

export async function getSymbolProp(symbol: string): Promise<SymbolProp> {
  const body = await request<SymbolProp>(`/stocks/${encodeURIComponent(symbol)}/prop-trading`);
  return body.data as SymbolProp;
}

export async function getSymbolInsider(symbol: string): Promise<SymbolInsider> {
  const body = await request<SymbolInsider>(`/stocks/${encodeURIComponent(symbol)}/insider`);
  return body.data as SymbolInsider;
}

export async function getConviction(symbol: string): Promise<ConvictionProfile | null> {
  const body = await request<ConvictionProfile>(
    `/stocks/${encodeURIComponent(symbol)}/conviction`,
  );
  return body.data ?? null;
}

export async function getSectorValuation(symbol: string): Promise<SectorValuation> {
  const body = await request<SectorValuation>(
    `/stocks/${encodeURIComponent(symbol)}/valuation/sector`,
  );
  return body.data as SectorValuation;
}

export async function getDcf(symbol: string, params: DcfParams): Promise<DcfResult> {
  const body = await request<DcfResult>(
    `/stocks/${encodeURIComponent(symbol)}/valuation/dcf`,
    { method: "POST", body: JSON.stringify(params) },
  );
  return body.data as DcfResult;
}

export async function getStockDetail(symbol: string): Promise<StockDetail> {
  const body = await request<StockDetail>(`/stocks/${encodeURIComponent(symbol)}`);
  if (!body.data) {
    throw new ApiError(`Không tìm thấy dữ liệu cho mã ${symbol}`, 404);
  }
  return body.data;
}

export async function getFactorRanking(): Promise<FactorRow[]> {
  const body = await request<FactorRow[]>("/screener/factors");
  return body.data ?? [];
}

export async function getRadar(): Promise<RadarResult> {
  // Fast path: DB-only rows (forensic + valuation + coverage) render instantly; the
  // network overlays (foreign/tự doanh/news) come from getRadarFlow as a second pass.
  const body = await request<RadarItem[]>("/screener/radar?overlays=false");
  const coverage = (body.meta as { coverage?: RadarCoverage } | null)?.coverage ?? null;
  return { items: body.data ?? [], coverage };
}

export type RadarFlowMap = Record<
  string,
  Pick<RadarItem, "foreign_net" | "prop_net" | "news_count" | "latest_news">
>;

export async function getRadarFlow(symbols: string[]): Promise<RadarFlowMap> {
  if (symbols.length === 0) return {};
  const qs = encodeURIComponent(symbols.join(","));
  const body = await request<RadarFlowMap>(`/screener/radar/flow?symbols=${qs}`);
  return body.data ?? {};
}

export async function getRadarWatch(): Promise<RadarWatchItem[]> {
  const body = await request<RadarWatchItem[]>("/alerts/radar-watch");
  return body.data ?? [];
}

export async function nlScreener(query: string): Promise<ScreenerFilterBody> {
  const body = await request<{ filter: ScreenerFilterBody }>("/screener/nl", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return (body.data as { filter: ScreenerFilterBody } | null)?.filter ?? {};
}

export async function screenerFilter(
  filter: ScreenerFilterBody,
): Promise<ScreenerResponse> {
  const body = await request<StockResult[]>(`/screener/filter`, {
    method: "POST",
    body: JSON.stringify(filter),
  });
  return {
    data: body.data ?? [],
    meta: (body.meta as unknown as ScreenerMeta | null) ?? null,
  };
}

export async function getSectors(): Promise<string[]> {
  const body = await request<string[]>(`/screener/sectors`);
  return body.data ?? [];
}

export async function getSectorsOverview(): Promise<SectorsOverview> {
  const body = await request<SectorsOverview>(`/meta/sectors`);
  return body.data ?? { sectors: [], count: 0, change_available: false };
}

export async function getQualityPicks(): Promise<QualityPicks> {
  const body = await request<QualityPicks>(`/screener/quality-picks`);
  return (
    body.data ?? {
      picks: [],
      count: 0,
      disclaimer: "",
      criteria: {
        roe_min: 0,
        debt_equity_max: 0,
        net_margin_min: 0,
        pe_min: 0,
        pe_max: 0,
        market_cap_min: 0,
      },
    }
  );
}

// --- Watchlists -------------------------------------------------------------

export async function getWatchlists(): Promise<Watchlist[]> {
  const body = await request<Watchlist[]>(`/watchlist`);
  return body.data ?? [];
}

export async function createWatchlist(
  name: string,
  symbols: string[] = [],
): Promise<Watchlist> {
  const body = await request<Watchlist>(`/watchlist`, {
    method: "POST",
    body: JSON.stringify({ name, symbols }),
  });
  if (!body.data) throw new ApiError("Tạo danh mục thất bại", 500);
  return body.data;
}

export async function updateWatchlist(
  id: number,
  patch: { name?: string; symbols?: string[] },
): Promise<Watchlist> {
  const body = await request<Watchlist>(`/watchlist/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  if (!body.data) throw new ApiError("Cập nhật danh mục thất bại", 500);
  return body.data;
}

export async function deleteWatchlist(id: number): Promise<void> {
  await request<unknown>(`/watchlist/${id}`, { method: "DELETE" });
}

export async function getWatchlistMetrics(id: number): Promise<StockResult[]> {
  const body = await request<StockResult[]>(`/watchlist/${id}/metrics`);
  return body.data ?? [];
}

// --- Saved screens (named screener filters) ---------------------------------

export async function getSavedScreens(): Promise<SavedScreen[]> {
  const body = await request<SavedScreen[]>(`/screener/saved`);
  return body.data ?? [];
}

export async function saveScreen(
  name: string,
  criteria: ScreenerFilterBody,
): Promise<number> {
  const body = await request<{ id: number; name: string }>(`/screener/save`, {
    method: "POST",
    body: JSON.stringify({ name, criteria }),
  });
  return body.data?.id ?? 0;
}

export async function deleteSavedScreen(id: number): Promise<void> {
  await request<unknown>(`/screener/saved/${id}`, { method: "DELETE" });
}

// --- Investment journal -----------------------------------------------------

export async function getJournalEntries(symbol?: string): Promise<JournalEntry[]> {
  const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
  const body = await request<JournalEntry[]>(`/journal${query}`);
  return body.data ?? [];
}

export async function createJournalEntry(
  entry: JournalCreateBody,
): Promise<JournalEntry> {
  const body = await request<JournalEntry>(`/journal`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
  if (!body.data) throw new ApiError("Tạo nhật ký thất bại", 500);
  return body.data;
}

export async function updateJournalEntry(
  id: number,
  patch: JournalUpdateBody,
): Promise<JournalEntry> {
  const body = await request<JournalEntry>(`/journal/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  if (!body.data) throw new ApiError("Cập nhật nhật ký thất bại", 500);
  return body.data;
}

export async function deleteJournalEntry(id: number): Promise<void> {
  await request<unknown>(`/journal/${id}`, { method: "DELETE" });
}

// --- BCTC documents ---------------------------------------------------------

export async function getDocuments(symbol?: string): Promise<DocumentMeta[]> {
  const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
  const body = await request<DocumentMeta[]>(`/documents${query}`);
  return body.data ?? [];
}

export async function uploadDocument(
  file: File,
  symbol?: string,
): Promise<DocumentMeta> {
  const form = new FormData();
  form.append("file", file);
  if (symbol) form.append("symbol", symbol);
  // Multipart: do NOT set Content-Type — the browser adds the boundary.
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/documents`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    throw new ApiError(`Không thể kết nối tới máy chủ API: ${detail}`, 0);
  }
  const body = await parseEnvelope<DocumentMeta>(res);
  if (!body.data) throw new ApiError("Tải lên thất bại", res.status);
  return body.data;
}

export async function getAvailableReports(symbol: string): Promise<AvailableReports> {
  const body = await request<AvailableReports>(
    `/documents/available/${encodeURIComponent(symbol)}`,
  );
  return body.data ?? { symbol, reports: [] };
}

/** Download the V-Investment OS PDF report for a stock (triggers a browser save). */
export async function downloadStockReport(symbol: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/stocks/${encodeURIComponent(symbol)}/report.pdf`, {
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Network error", 0);
  }
  if (!res.ok) throw new ApiError("Không tạo được báo cáo PDF", res.status);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename="([^"]+)"/);
  const filename = m ? m[1] : `VI-OS_${symbol.toUpperCase()}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCompareReport(symbols: string[]): Promise<void> {
  if (symbols.length === 0) throw new ApiError("Chưa có mã để xuất báo cáo", 0);
  const qs = encodeURIComponent(symbols.join(","));
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/reports/compare.pdf?symbols=${qs}`, { cache: "no-store" });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Network error", 0);
  }
  if (!res.ok) throw new ApiError("Không tạo được báo cáo so sánh", res.status);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename="([^"]+)"/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = m ? m[1] : "VI-OS_SoSanh.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchReport(symbol: string, url?: string): Promise<DocumentMeta> {
  const body = await request<DocumentMeta>(`/documents/fetch`, {
    method: "POST",
    body: JSON.stringify({ symbol, url }),
  });
  if (!body.data) throw new ApiError("Không lấy được BCTC", 502);
  return body.data;
}

export async function analyzeDocument(id: number, force = false): Promise<DocumentMeta> {
  const body = await request<DocumentMeta>(
    `/documents/${id}/analyze${force ? "?force=true" : ""}`,
    { method: "POST" },
  );
  if (!body.data) throw new ApiError("Phân tích thất bại", 500);
  return body.data;
}

export async function deleteDocument(id: number): Promise<void> {
  await request<unknown>(`/documents/${id}`, { method: "DELETE" });
}

// --- Portfolio (research-only holdings) --------------------------------------

export async function getPortfolioAnalysis(): Promise<PortfolioAnalysis> {
  const body = await request<PortfolioAnalysis>(`/portfolio/analysis`);
  if (!body.data) throw new ApiError("Không tải được danh mục", 500);
  return body.data;
}

export async function createPosition(input: {
  symbol: string;
  quantity: number;
  avg_cost: number;
  note?: string;
}): Promise<void> {
  await request<unknown>(`/portfolio`, { method: "POST", body: JSON.stringify(input) });
}

export async function deletePosition(id: number): Promise<void> {
  await request<unknown>(`/portfolio/${id}`, { method: "DELETE" });
}

// --- News (public RSS relay) -------------------------------------------------

export async function getMarketNews(): Promise<NewsItem[]> {
  const body = await request<NewsItem[]>(`/news/market`);
  return body.data ?? [];
}

export async function getSymbolNews(symbol: string): Promise<NewsItem[]> {
  const body = await request<NewsItem[]>(`/news/symbol/${encodeURIComponent(symbol)}`);
  return body.data ?? [];
}

export async function getPersonalizedNews(): Promise<NewsItem[]> {
  const body = await request<NewsItem[]>(`/news/personalized`);
  return body.data ?? [];
}

// --- Analytics ---------------------------------------------------------------

export async function getAnalytics(): Promise<Analytics> {
  const body = await request<Analytics>(`/analytics`);
  if (!body.data) throw new ApiError("Không tải được phân tích", 500);
  return body.data;
}

export async function syncIndex(): Promise<Record<string, number>> {
  const body = await request<Record<string, number>>(`/analytics/sync-index`, { method: "POST" });
  return body.data ?? {};
}

export async function getConsiderationSummary(
  symbol: string,
): Promise<ConsiderationSummary | null> {
  const body = await request<{ summary: ConsiderationSummary | null }>(
    `/documents/summary?symbol=${encodeURIComponent(symbol)}`,
  );
  return body.data?.summary ?? null;
}

export async function generateConsiderationSummary(
  symbol: string,
  force = false,
): Promise<ConsiderationSummary | null> {
  const body = await request<{ summary: ConsiderationSummary | null }>(`/documents/summary`, {
    method: "POST",
    body: JSON.stringify({ symbol, force }),
  });
  return body.data?.summary ?? null;
}

export async function getFraudScores(symbol: string): Promise<FraudScores | null> {
  const body = await request<FraudScores>(`/stocks/${encodeURIComponent(symbol)}/fraud-scores`);
  return body.data ?? null;
}

export async function researchSearch(
  symbol: string,
  questions: ResearchQuestion[],
): Promise<ResearchSearchResult | null> {
  const body = await request<ResearchSearchResult>(
    `/stocks/${encodeURIComponent(symbol)}/research-search`,
    { method: "POST", body: JSON.stringify({ questions }) },
  );
  return body.data ?? null;
}

export { API_BASE_URL };
