// Types mirror docs/API_CONTRACT.md exactly. Do not diverge from the backend contract.

export type Exchange = "HOSE" | "HNX" | "UPCOM";

export interface StockResult {
  symbol: string;
  company_name: string;
  exchange: Exchange;
  industry: string | null;
  market_cap: number | null; // tỷ VND (billions)
  close_price: number | null; // VND
  change_pct: number | null; // % day change
  pe: number | null;
  pb: number | null;
  roe: number | null; // %
  roa: number | null; // %
  net_margin: number | null; // % (NPM)
  revenue_growth: number | null; // % YoY
  eps_growth: number | null; // % YoY
  debt_equity: number | null;
  current_ratio: number | null;
  dividend_yield: number | null; // %
  avg_volume_30d: number | null;
  pe_vs_hist?: number | null; // % current P/E vs own 5yr-avg P/E (neg = cheaper)
  compass_long?: number | null; // Compass long-term, universe-wide (DB-only)
  beneish_flag?: string | null; // Beneish manipulation flag
  earnings_quality_flag?: string | null; // QoE flag (strong/adequate/weak/insufficient_data)
  earnings_quality_score?: number | null; // QoE 0-100 (higher = better)
  conviction_overall?: string | null; // solid|mixed|watch|elevated_risk|insufficient
  quant_score: number | null; // 0-100
  quant_grade: string | null; // "A++","A+","B++","B","C"...
  updated_at: string | null; // ISO8601
}

export interface QuarterlyProfit {
  period: string;
  value: number;
}

export interface OwnershipEntry {
  name: string;
  pct: number;
}

export interface StockDetail extends StockResult {
  charter_capital: number | null; // Vốn điều lệ (tỷ VND)
  eps_trailing: number | null; // EPS (Trailing)
  profit_growth: number | null; // Tăng trưởng LN %
  cash: number | null; // Tiền mặt (tỷ VND)
  quarterly_profit: QuarterlyProfit[]; // Q/Q growth chart
  ownership: OwnershipEntry[]; // Cấu trúc sở hữu
  tags: string[]; // ["VN30"]
}

// Response envelope (consistent across endpoints unless noted).
export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta: Record<string, unknown> | null;
}

export interface StocksMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ScreenerMeta {
  total: number;
  filtered: number;
  limit: number;
}

// GET /stocks query params
export interface GetStocksParams {
  exchange?: Exchange;
  industry?: string;
  limit?: number;
  offset?: number;
}

export type SortOrder = "asc" | "desc";

// POST /screener/filter body — all fields optional.
export interface ScreenerFilterBody {
  sector?: string;
  exchange?: Exchange[];
  pe_max?: number;
  pb_max?: number;
  roe_min?: number;
  roa_min?: number;
  revenue_growth_min?: number;
  market_cap_min?: number;
  avg_volume_30d_min?: number;
  debt_equity_max?: number;
  dividend_yield_min?: number;
  pe_vs_hist_max?: number;
  exclude_beneish_high_risk?: boolean;
  exclude_weak_earnings_quality?: boolean;
  limit?: number;
  sort_by?: keyof StockResult;
  sort_order?: SortOrder;
}

// Paired payload + meta returned by list-style endpoints.
export interface StocksResponse {
  data: StockResult[];
  meta: StocksMeta | null;
}

export interface ScreenerResponse {
  data: StockResult[];
  meta: ScreenerMeta | null;
}

// Watchlist (single-user, no auth)
export interface Watchlist {
  id: number;
  name: string;
  symbols: string[];
  created_at: string | null;
}

// Saved screen = a named ScreenerFilterBody (reuses backend saved_filters)
export interface SavedScreen {
  id: number;
  name: string;
  criteria: ScreenerFilterBody;
}

// Investment journal (personal thesis notes — research only, no positions/P&L)
export type JournalAction = "buy" | "sell" | "watch" | "note";
export type JournalStatus = "open" | "closed";

export interface JournalEntry {
  id: number;
  symbol: string | null;
  action: JournalAction;
  thesis: string;
  target_price: number | null;
  catalyst: string | null;
  price_at_entry: number | null;
  status: JournalStatus;
  review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  reviewed_at: string | null;
}

export interface JournalCreateBody {
  symbol?: string | null;
  action: JournalAction;
  thesis: string;
  target_price?: number | null;
  catalyst?: string | null;
}

export interface JournalUpdateBody {
  action?: JournalAction;
  thesis?: string;
  target_price?: number | null;
  catalyst?: string | null;
  status?: JournalStatus;
  review_note?: string | null;
}

// BCTC documents + AI analysis (research-only: extract/summarize, no advice)
export interface KeyFigure {
  label: string;
  value: string;
  unit: string | null;
}

export interface StructureItem {
  label: string;
  value: number | null; // tỷ VND
  pct: number | null;
}

export interface MultiYearTrend {
  years: string[];
  revenue: (number | null)[];
  net_profit: (number | null)[];
  gross_margin_pct: (number | null)[];
  net_margin_pct: (number | null)[];
  roe_pct: (number | null)[];
  roa_pct: (number | null)[];
  total_debt: (number | null)[];
  equity: (number | null)[];
  note: string;
}

export interface RevenueBreakdown {
  items: StructureItem[];
  note: string;
}

export interface Ratio {
  label: string;
  value: string;
  benchmark: string | null;
}

export interface CashflowItem {
  label: string;
  value: number | null;
}

export interface CashflowActivity {
  net: number | null;
  items: CashflowItem[];
}

export interface Cashflow {
  operating: CashflowActivity;
  investing: CashflowActivity;
  financing: CashflowActivity;
}

export interface AnalysisResult {
  key_figures: KeyFigure[];
  summary: string;
  yoy_changes: string[];
  risk_flags: string[];
  // Extended (optional — present when the report contains the data)
  multi_year_trend?: MultiYearTrend;
  asset_structure?: StructureItem[];
  capital_structure?: StructureItem[];
  revenue_breakdown?: RevenueBreakdown;
  ratios?: Ratio[];
  cashflow?: Cashflow;
  notes?: string[];
}

export interface OhlcBar {
  time: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export type SourceStatus = "ok" | "error" | "unreachable";

export interface ProviderSource {
  key: string;
  label: string;
  host: string;
  status: SourceStatus;
  http_status: number | null;
  latency_ms: number | null;
  detail: string;
}

export interface ProvidersStatus {
  current: string;
  default: string;
  options: string[];
  sources: ProviderSource[];
}

// Valuation (research-only: estimated ranges, no buy/sell advice)
export interface ValuationMethod {
  value: number | null;
  note: string;
}

export interface ValuationRange {
  low: number | null;
  high: number | null;
  median: number | null;
}

export interface EarningsQuality {
  outliers_detected: { year: string; reasons: string[] }[];
  fallback_used: boolean;
  note: string;
  periods_used: string[];
}

export interface Valuation {
  current_price: number | null;
  shares_outstanding: number;
  methods: {
    pe_eps_avg: ValuationMethod;
    pb_bvps_avg: ValuationMethod;
    graham: ValuationMethod;
  };
  valuation_range: ValuationRange;
  vs_current_price: { discount_pct: number | null; interpretation: string };
  earnings_quality: EarningsQuality;
}

export type PillarStatus = "good" | "neutral" | "risk" | "unknown";

export interface ConvictionPillar {
  key: string;
  label: string;
  status: PillarStatus;
  headline: string;
}

export interface ConvictionFlow {
  key: string; // insider | foreign | prop
  label: string;
  direction: "buy" | "sell" | "neutral";
  text: string;
}

export interface ConvictionProfile {
  symbol: string;
  overall: "solid" | "mixed" | "watch" | "elevated_risk" | "insufficient";
  overall_text: string;
  pillars: ConvictionPillar[];
  flag_counts: Record<PillarStatus, number>;
  cross_signals: string[];
  flow_signals?: ConvictionFlow[];
  sources: { forensic: boolean; sector_valuation: boolean };
  disclaimer: string;
}

export interface RadarWatchItem {
  symbol: string;
  company_name: string | null;
  conviction_overall: string;
  earnings_quality_flag: string | null;
  beneish_flag: string | null;
  altman_em_zone: string | null;
  reasons: string[];
}

export interface SymbolForeign {
  available: boolean;
  symbol: string;
  note?: string;
  buy_vol?: number | null;
  sell_vol?: number | null;
  net_vol?: number | null;
  buy_val?: number | null; // tỷ VND
  sell_val?: number | null; // tỷ VND
  net_val?: number | null; // tỷ VND (>0 = mua ròng)
  current_room?: number | null;
  total_room?: number | null;
  room_used_pct?: number | null;
}

export interface SymbolProp {
  available: boolean;
  symbol: string;
  note?: string;
  date?: string | null; // ISO yyyy-mm-dd of the latest session
  buy_vol?: number | null;
  sell_vol?: number | null;
  net_vol?: number | null;
  buy_val?: number | null; // tỷ VND
  sell_val?: number | null; // tỷ VND
  net_val?: number | null; // tỷ VND (>0 = tự doanh mua ròng)
}

export interface InsiderDeal {
  public_date: string | null;
  start_date?: string | null;
  end_date?: string | null;
  trader: string | null;
  position: string | null;
  action: string | null; // Mua | Bán | Thưởng
  action_code?: string | null;
  status: string; // done | registered | other
  register_shares?: number | null;
  transacted_shares?: number | null; // signed: Mua +, Bán −
  ownership_after_pct?: number | null;
  event_code?: string | null;
  source_url?: string | null;
}

export interface InsiderSummary {
  window_days: number;
  net_shares: number; // >0 = insiders net buying
  buy_count: number;
  sell_count: number;
  direction: string; // buy | sell | neutral
}

export interface SymbolInsider {
  available: boolean;
  symbol: string;
  note?: string;
  count?: number;
  summary?: InsiderSummary;
  deals?: InsiderDeal[];
}

export interface RadarCoverage {
  scanned: number; // distinct symbols with a forensic score
  total: number; // listed stocks
}

export interface RadarResult {
  items: RadarItem[];
  coverage: RadarCoverage | null;
}

export interface RadarLatestNews {
  title: string | null;
  link: string | null;
  published: string | null;
  source: string | null;
}

export interface RadarItem {
  symbol: string;
  company_name: string | null;
  industry: string | null;
  market_cap: number | null;
  conviction_overall: string; // solid|mixed|watch|elevated_risk|insufficient
  earnings_quality_flag: string | null;
  earnings_quality_score: number | null;
  beneish_flag: string | null;
  altman_em_zone: string | null;
  period: string;
  news_count?: number;
  latest_news?: RadarLatestNews | null;
  foreign_net?: number | null; // net foreign buy (tỷ VND), latest session
  prop_net?: number | null; // net proprietary-desk (tự doanh) buy (tỷ VND), latest session
  valuation_flag?: string; // cheap|fair|rich|unknown vs sector median P/E & P/B
  valuation_premium_pct?: number | null; // avg premium to sector (>0 = richer)
}

export interface NewsSignal {
  headline: string;
  event_type: string; // business_update|earnings|dividend|capital_raise|insider_shareholder|management|mna|regulatory_legal|macro_sector|other
  sentiment: "positive" | "negative" | "neutral";
  extract: string;
  published: string | null;
  source: string | null;
  link: string | null;
}

export interface NewsSignals {
  available: boolean;
  symbol: string;
  note?: string;
  analyzed_count?: number;
  signals?: NewsSignal[];
  summary?: {
    net_sentiment: "positive" | "negative" | "mixed" | "neutral";
    dominant_events: string[];
    note: string;
  };
}

export interface SectorRelMethod {
  value: number | null;
  own_multiple: number | null;
  sector_multiple: number | null;
  premium_pct: number | null; // >0 = pricier than the sector median
  note: string;
}

export interface SectorValuation {
  industry: string | null;
  peer_count: number;
  current_price: number | null;
  methods: { pe_relative: SectorRelMethod; pb_relative: SectorRelMethod };
  valuation_range: ValuationRange;
  vs_current_price: { discount_pct: number | null; interpretation: string };
  relative_position: string;
  avg_premium_pct: number | null;
  notes: string[];
}

export interface DcfResult {
  dcf_value: number | null;
  assumptions_used: {
    growth_pct: number;
    discount_pct: number;
    years: number;
    terminal_growth_pct: number;
    base_operating_cashflow_billion: number | null;
  };
  sensitivity_note: string;
}

export interface DcfParams {
  growth_rate: number;
  discount_rate: number;
  years: number;
}

export interface IndexSummary {
  symbol: string;
  level: number;
  change_pct: number | null;
  as_of: string;
  ret_1w: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_ytd: number | null;
  ret_1y: number | null;
  series: { date: string; close: number }[];
}

export interface SectorVsMarket {
  label: string;
  portfolio_pct: number;
  market_pct: number;
  diff: number;
}

export interface Analytics {
  market: IndexSummary[];
  has_portfolio: boolean;
  disclaimer: string;
  totals?: { market_value: number; cost_basis: number; pnl: number; pnl_pct: number | null };
  income_quality?: {
    expected_annual_dividend: number;
    portfolio_yield_pct: number | null;
    wavg_pe: number | null;
    wavg_roe: number | null;
    solid_count: number;
    risk_flags: string[];
  };
  pnl_by_sector?: { label: string; pnl: number; pnl_pct: number | null }[];
  concentration?: { top1: number; top3: number; hhi: number; positions: number };
  sector_vs_market?: SectorVsMarket[];
  avg_compass_long?: number | null;
  best?: { symbol: string; pnl_pct: number }[];
  worst?: { symbol: string; pnl_pct: number }[];
  benchmark?: {
    portfolio_return_pct: number | null;
    vnindex_ytd: number | null;
    vnindex_1y: number | null;
    since_entry: { included: number; weighted_alpha_pct: number } | null;
  };
}

export interface NewsItem {
  title: string;
  link: string;
  published: string;
  published_iso: string | null;
  source: string | null;
  summary: string;
  symbol?: string; // set on the personalized feed
}

// Portfolio (research-only manual holdings)
export interface Holding {
  id: number;
  symbol: string;
  company_name: string | null;
  industry: string | null;
  exchange: string | null;
  quantity: number;
  avg_cost: number;
  price: number | null;
  market_value: number | null;
  cost_basis: number;
  pnl: number | null;
  pnl_pct: number | null;
  weight: number | null;
  compass: { short: number | null; mid: number | null; long: number | null } | null;
  note: string | null;
}

export interface AllocationSlice {
  label: string;
  value: number;
  pct: number | null;
  count: number;
}

export interface PortfolioAnalysis {
  holdings: Holding[];
  totals: {
    market_value: number;
    cost_basis: number;
    pnl: number;
    pnl_pct: number | null;
    positions: number;
    priced: number;
  };
  allocation_sector: AllocationSlice[];
  allocation_exchange: AllocationSlice[];
  unpriced: string[];
  disclaimer: string;
}

// Investment Compass (research-only composite scores)
export interface CompassHorizon {
  score: number | null;
  breakdown: Record<string, number | null>;
  explanation: string[];
}

export interface RoeHistory {
  available: true;
  series: { year: number; roe: number }[];
  years: number[];
  latest: number;
  avg_prior: number | null;
  avg_recent: number;
  trend: "rising" | "stable" | "falling";
  is_spike: boolean;
  spike_factor: number | null;
  positive_years: number;
  n: number;
  level_score: number;
  consistency_score: number;
  quality_score: number;
}

export interface DividendHistory {
  available: true;
  series: { year: number; dividend_yield: number }[];
  years: number[];
  n: number;
  years_paid: number;
  pay_ratio: number;
  recent_streak: number;
  avg_yield: number;
  avg_paid_yield: number;
  score: number;
}

export interface Compass {
  disclaimer: string;
  short_term: CompassHorizon;
  mid_term: CompassHorizon;
  long_term: CompassHorizon;
  roe_history: RoeHistory | null;
  dividend_history: DividendHistory | null;
  data_gaps: string[];
}

export interface QualityPick {
  symbol: string;
  company_name: string | null;
  industry: string | null;
  market_cap: number | null;
  roe: number | null;
  pe: number | null;
  pb: number | null;
  net_margin: number | null;
  debt_equity: number | null;
  dividend_yield: number | null;
  fundamental_score: number;
  reasons: string[];
}

export interface QualityPicks {
  picks: QualityPick[];
  count: number;
  disclaimer: string;
  criteria: {
    roe_min: number;
    debt_equity_max: number;
    net_margin_min: number;
    pe_min: number;
    pe_max: number;
    market_cap_min: number;
  };
}

export interface SectorRow {
  industry: string;
  count: number;
  total_market_cap: number | null;
  median_pe: number | null;
  median_pb: number | null;
  median_roe: number | null;
  median_net_margin: number | null;
  avg_change_pct: number | null;
}

export interface SectorsOverview {
  sectors: SectorRow[];
  count: number;
  change_available: boolean;
}

export interface PeerMetric {
  key: string;
  label: string;
  higher_is_better: boolean;
  value: number | null;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  percentile: number | null;
}

export interface PeerComparison {
  industry: string;
  peer_count: number;
  metrics: PeerMetric[];
}

export interface Playbook {
  content: string;
  updated_at: string | null;
}

// 4-tier funnel result row: a screener result + Tier-2 flags + Tier-3 short-term score
export type FunnelFlag = "earnings_spike" | "high_leverage";
export interface FunnelRow extends StockResult {
  flags: FunnelFlag[];
  shortTerm: number | null;
}

export interface CompassBadgeScores {
  short: number | null;
  mid: number | null;
  long: number | null;
  computed_at: string | null;
}

export type CompassScoresMap = Record<string, CompassBadgeScores>;

export interface StrengthPoint {
  point: string;
  evidence: string;
  significance: string;
}

export interface ConcernPoint {
  point: string;
  evidence: string;
  implication: string;
}

export interface BenchMetric {
  key: string;
  label: string;
  higher_is_better: boolean;
  value: number | null;
  median: number | null;
  n: number;
  percentile: number | null;
}

export interface BenchPeer {
  symbol: string;
  company_name: string | null;
  market_cap: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  net_margin: number | null;
}

export interface IndustryComparison {
  industry: string;
  peer_count: number;
  metrics: BenchMetric[];
  peers: BenchPeer[];
}

export interface ConsiderationSummary {
  strengths: StrengthPoint[];
  concerns: ConcernPoint[];
  valuation_context: {
    summary: string;
    what_market_implies: string;
    key_uncertainty: string;
  } | null;
  questions_to_answer: ResearchQuestion[];
  compass_interpretation: string | null;
  recent_developments: { headline: string; note: string }[];
  industry_comparison: IndustryComparison | null;
}

export interface ResearchQuestion {
  question: string;
  search_keywords: string[];
  question_type: string;
}

export interface ResearchFinding {
  title: string;
  url: string;
  source: string;
  published_date: string | null;
  relevance: "high" | "medium";
  snippet: string;
}

export interface FraudScores {
  symbol: string;
  period: string;
  beneish: {
    score: number | null;
    flag: "high_risk" | "medium_risk" | "low_risk" | "insufficient_data";
    interpretation: string;
    variables_used: number;
    top_contributors: { variable: string; contribution: number; meaning: string }[];
  };
  altman: {
    score: number | null;
    zone: "safe" | "grey" | "distress" | "not_applicable" | "insufficient_data";
    interpretation: string;
    model: string;
    original: { score: number | null; zone: string; interpretation: string; model: string };
  };
  piotroski: {
    score: number;
    max_score: number;
    criteria: { name: string; passed: boolean | null }[];
  };
  earnings_quality: {
    score: number | null;
    flag: "strong" | "adequate" | "weak" | "insufficient_data";
    interpretation: string;
    components_used: number;
    components: { name: string; value: number; sub_score: number; meaning: string }[];
  };
  disclaimer: string;
}

export interface ResearchAnswer {
  question: string;
  question_type: string;
  status: "found" | "partial" | "not_found";
  findings: ResearchFinding[];
}

export interface ResearchSearchResult {
  searched_at: string;
  answers: ResearchAnswer[];
}

export interface ReportItem {
  url: string;
  year: number | null;
  date: string | null;
  kind: string;
  title: string;
  period: string; // annual | quarterly | interim
  in_system: boolean;
}

export interface AvailableReports {
  symbol: string;
  reports: ReportItem[];
}

export interface DocumentMeta {
  id: number;
  symbol: string | null;
  filename: string;
  size_bytes: number | null;
  source_url?: string | null;
  report_period?: string | null; // annual | quarterly | interim
  analysis: AnalysisResult | null;
  analysis_model: string | null;
  uploaded_at: string | null;
  analyzed_at: string | null;
}

export interface WorldQuote {
  symbol: string;
  name: string;
  group: string; // "Chỉ số" | "Hàng hóa" | "Tiền tệ" | "Crypto"
  price: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  currency: string | null;
}

export interface CryptoQuote {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null; // 24h
  market_cap: number | null;
}

export interface MacroPoint {
  series_id: string;
  name: string;
  unit: string;
  value: number | null;
  date: string | null;
}

export interface WbPoint {
  indicator: string;
  name: string;
  unit: string;
  value: number | null;
  date: string | null;
}

export interface AseanPoint {
  country: string; // ISO3, e.g. "VNM"
  name: string;
  value: number | null; // GDP growth %
  date: string | null;
}

export interface NewsChannel {
  key: string;
  label: string;
}

export interface MoverRow {
  symbol: string;
  company_name: string | null;
  close_price: number | null;
  change_pct: number | null;
  avg_volume_30d: number | null;
  foreign_net?: number | null; // net foreign buy (tỷ VND), latest session
  prop_net?: number | null; // net proprietary-desk (tự doanh) buy (tỷ VND), latest session
}

export interface MarketBreadth {
  advancers: number;
  decliners: number;
  unchanged: number;
  total: number;
}

export interface MoversData {
  gainers: MoverRow[];
  losers: MoverRow[];
  most_active: MoverRow[];
  breadth: MarketBreadth;
  change_available: boolean;
}

export interface Technicals {
  available: boolean;
  bars_used: number;
  price?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  rsi14?: number | null;
  macd?: { line: number | null; signal: number | null; hist: number | null };
  bollinger?: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    percent_b: number | null;
    width: number | null;
  };
  atr14?: number | null;
  week52?: { high: number | null; low: number | null; position: number | null };
}

export interface DbnPoint {
  code: string;
  name: string;
  unit: string;
  value: number | null;
  period: string | null;
}

export interface RiskCorrelation {
  a: string;
  b: string;
  corr: number | null;
}

export interface PortfolioRisk {
  available: boolean;
  note?: string;
  symbols?: string[];
  metrics?: {
    days: number;
    annual_volatility: number | null;
    sharpe: number | null;
    max_drawdown: number | null;
    var_95: number | null;
  };
  correlations?: RiskCorrelation[];
}

export interface AlertRule {
  id?: number;
  symbol: string;
  metric: string;
  op: string;
  value: number;
  note?: string;
}

export interface AlertsConfig {
  rules: AlertRule[];
  metrics: string[];
  ops: Record<string, string>;
  updated_at: string | null;
}

export interface TriggeredAlert extends AlertRule {
  current: number;
}

export interface Note {
  id: number;
  symbol: string | null;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface LensCriterion {
  label: string;
  status: "pass" | "fail" | "na";
  detail: number | null;
}

export interface InvestmentLens {
  key: string;
  name: string;
  description: string;
  met: number;
  total: number;
  criteria: LensCriterion[];
}

export interface BacktestStats {
  annual_volatility: number | null;
  sharpe: number | null;
  max_drawdown: number | null;
}

export interface Backtest {
  available: boolean;
  note?: string;
  days?: number;
  fast?: number;
  slow?: number;
  strategy_return?: number;
  buyhold_return?: number;
  strategy?: BacktestStats;
  buyhold?: BacktestStats;
  trades?: number;
  win_rate?: number | null;
  time_in_market?: number;
  equity?: { i: number; s: number; b: number }[];
}

export interface ForeignSummary {
  available: boolean;
  note?: string;
  date?: string | null;
  index?: string | null;
  buy_vol?: number | null;
  sell_vol?: number | null;
  buy_val?: number | null;
  sell_val?: number | null;
  net_val?: number | null;
  pct_buy_val?: number | null;
  pct_sell_val?: number | null;
  stale?: boolean; // served from cache after an upstream fetch failure
}

export interface FactorRow {
  symbol: string;
  company_name: string | null;
  industry: string | null;
  value: number | null;
  quality: number | null;
  growth: number | null;
  composite: number | null;
}
