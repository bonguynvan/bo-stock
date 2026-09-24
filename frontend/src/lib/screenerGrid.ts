// Builds the bo-grid `config` object for the screener table from our domain data.
// Kept pure (no DOM) so it can be unit-tested.
import type { CompassScoresMap, StockResult } from "@/types/stock";
import { METRIC_TOOLTIPS } from "./metricTooltips";

// Header tooltip text per column — metric definitions (restored on grid headers
// via bo-grid v1's headerTooltip) + Compass horizon descriptions.
const HEADER_TIPS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(METRIC_TOOLTIPS).map(([k, t]) => [
      k,
      [
        t.definition,
        t.formula ? `= ${t.formula}` : null,
        t.benchmark,
        t.caveat ? `⚠️ ${t.caveat}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ]),
  ),
};

function headerTip(key: string): { headerTooltip?: string; headerInfo?: boolean } {
  const tip = HEADER_TIPS[key];
  return tip ? { headerTooltip: tip, headerInfo: true } : {};
}

// Liquidity (avg 30d volume) warning glyph shown beside the ticker — a quiet cue
// that a high-score stock may be hard to trade. Thresholds mirror funnel.ts.
const VOL_VERY_LOW = 100_000;
const VOL_LOW = 500_000;

function volumeStatus(v: unknown): "unknown" | "very_low" | "low" | "ok" {
  if (v == null || typeof v !== "number") return "unknown";
  if (v < VOL_VERY_LOW) return "very_low";
  if (v < VOL_LOW) return "low";
  return "ok";
}

function volumeGlyph(v: unknown): string {
  switch (volumeStatus(v)) {
    case "very_low":
      return ` <span style="font-size:11px;color:var(--bo-grid-down,#e06c75)">⚠️</span>`;
    case "low":
      return ` <span style="font-size:11px;color:var(--bo-grid-amber,#e0a92e)">⚡</span>`;
    case "unknown":
      return ` <span style="font-size:11px;opacity:.5">💧?</span>`;
    default:
      return "";
  }
}

// Beneish manipulation-risk dot beside the ticker (red high, amber medium).
function beneishGlyph(flag: unknown): string {
  if (flag === "high_risk") return ` <span style="font-size:11px;color:var(--bo-grid-down,#e06c75)" title="">◆</span>`;
  if (flag === "medium_risk") return ` <span style="font-size:11px;color:var(--bo-grid-amber,#e0a92e)" title="">◆</span>`;
  return "";
}

function beneishTooltip(flag: unknown): string {
  if (flag === "high_risk") return " · ◆ Beneish: rủi ro thao túng lợi nhuận CAO — soi kỹ";
  if (flag === "medium_risk") return " · ◆ Beneish: cảnh báo trung bình";
  return "";
}

function volumeTooltip(v: unknown): string {
  const n = typeof v === "number" ? v.toLocaleString("vi-VN") : "";
  switch (volumeStatus(v)) {
    case "very_low":
      return `⚠️ KLGD TB ${n}/phiên — rất thấp, có thể khó mua/bán`;
    case "low":
      return `⚡ KLGD TB ${n}/phiên — thấp, cân nhắc kỹ trước lệnh lớn`;
    case "unknown":
      return `💧 Chưa có dữ liệu thanh khoản — kiểm tra thủ công trên TCBS`;
    default:
      return `Thanh khoản OK — KLGD TB ${n}/phiên`;
  }
}

// Quality-of-Earnings column: 0-100 score, colored (cash-backed earnings = green).
const QOE_FLAG_LABEL: Record<string, string> = {
  strong: "tốt", adequate: "chấp nhận được", weak: "thấp",
  insufficient_data: "thiếu dữ liệu",
};
const qoeColor = (v: number | null): string =>
  v == null ? "var(--bo-grid-text)"
    : v >= 70 ? "var(--bo-grid-up)"
      : v >= 45 ? "var(--bo-grid-amber)"
        : "var(--bo-grid-down)";

const QOE_COLUMN = {
  key: "earnings_quality_score",
  header: "CL LN",
  type: "number",
  width: 84,
  align: "center",
  filter: "number",
  value: (row: GridRow) => num(row.earnings_quality_score),
  format: (v: unknown) => (v == null ? "—" : String(Math.round(v as number))),
  render: (ctx: { row: GridRow }) => {
    const v = num(ctx.row.earnings_quality_score);
    if (v == null) return `<span style="opacity:.4">—</span>`;
    return `<span style="font-weight:600;color:${qoeColor(v)}">${Math.round(v)}</span>`;
  },
  tooltip: (_v: unknown, row: GridRow) => {
    const v = num(row.earnings_quality_score);
    const flag = typeof row.earnings_quality_flag === "string"
      ? QOE_FLAG_LABEL[row.earnings_quality_flag] ?? row.earnings_quality_flag : null;
    if (v == null) return "Chất lượng lợi nhuận: chưa đủ dữ liệu (cần ≥2 năm BCTC)";
    return `Chất lượng lợi nhuận ${Math.round(v)}/100${flag ? ` (${flag})` : ""} — lợi nhuận có dòng tiền thực đỡ lưng đến đâu. Cao = tốt.`;
  },
  headerTooltip:
    "Chất lượng lợi nhuận (QoE 0–100): lợi nhuận có dòng tiền thực đỡ lưng đến đâu (dồn tích Sloan, chuyển đổi tiền mặt, phải thu, biên gộp). Đỏ <45 · Vàng 45–70 · Xanh >70. Sắp xếp/lọc được.",
  headerInfo: true,
};

// Financial-trust profile ("Hồ sơ") — market-wide overall from the conviction synthesis.
// Sorted by a severity rank (riskiest first on desc) so the whole universe can be ranked.
const CONVICTION_META: Record<string, { rank: number; label: string; color: string }> = {
  elevated_risk: { rank: 4, label: "Rủi ro", color: "var(--bo-grid-down,#e06c75)" },
  watch: { rank: 3, label: "Theo dõi", color: "var(--bo-grid-amber,#e0a92e)" },
  mixed: { rank: 2, label: "Hỗn hợp", color: "var(--bo-grid-amber,#e0a92e)" },
  solid: { rank: 1, label: "Tích cực", color: "var(--bo-grid-up,#98c379)" },
  insufficient: { rank: 0, label: "Thiếu dữ liệu", color: "var(--bo-grid-text)" },
};

const CONVICTION_COLUMN = {
  key: "conviction_overall",
  header: "Hồ sơ",
  type: "number",
  width: 96,
  align: "center",
  sortable: true,
  filter: false, // categorical; the label↔rank mismatch makes a number filter confusing
  // Sort by severity rank; unscored rows (null) sort last either way.
  value: (row: GridRow) => {
    const m = typeof row.conviction_overall === "string" ? CONVICTION_META[row.conviction_overall] : undefined;
    return m ? m.rank : null;
  },
  render: (ctx: { row: GridRow }) => {
    const m = typeof ctx.row.conviction_overall === "string"
      ? CONVICTION_META[ctx.row.conviction_overall] : undefined;
    if (!m) return `<span style="opacity:.4">—</span>`;
    return `<span style="font-weight:600;color:${m.color}">${m.label}</span>`;
  },
  tooltip: (_v: unknown, row: GridRow) => {
    const m = typeof row.conviction_overall === "string" ? CONVICTION_META[row.conviction_overall] : undefined;
    return m
      ? `Hồ sơ tin cậy tài chính: ${m.label} — tổng hợp pháp y (Beneish/Altman/Piotroski) + chất lượng lợi nhuận. Mở mã để xem chi tiết & định giá theo ngành.`
      : "Chưa đủ dữ liệu để dựng hồ sơ tin cậy";
  },
  headerTooltip:
    "Hồ sơ tin cậy tài chính (toàn sàn): tổng hợp pháp y + chất lượng lợi nhuận thành một mức — Rủi ro / Theo dõi / Hỗn hợp / Tích cực. Sắp xếp giảm dần để lọc ra mã rủi ro trước. Bản thị trường không gồm trục định giá — mở mã để xem đầy đủ.",
  headerInfo: true,
};

// Compact Compass badge: 3 colored dots (Ngắn/Trung/Dài) via bo-grid v1's JS
// render() hook. Colors use bo-grid theme tokens so they match the grid.
const compassDot = (s: number | null): string => {
  const color =
    s == null
      ? "var(--bo-grid-text)"
      : s > 70
        ? "var(--bo-grid-up)"
        : s >= 40
          ? "var(--bo-grid-amber)"
          : "var(--bo-grid-down)";
  const opacity = s == null ? 0.25 : 1;
  return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin:0 2px;background:${color};opacity:${opacity}"></span>`;
};

const num = (x: unknown): number | null => (typeof x === "number" ? x : null);

interface CompassCell {
  short: number | null;
  mid: number | null;
  long: number | null;
}
const asCompass = (x: unknown): CompassCell | null =>
  x && typeof x === "object" ? (x as CompassCell) : null;

const bandColor = (s: number): string =>
  s > 70 ? "var(--bo-grid-up)" : s >= 40 ? "var(--bo-grid-amber)" : "var(--bo-grid-down)";

// Universe-wide long-term (from ROE/dividend history), falling back to the cached
// full-Compass long when a BCTC has been analyzed.
const rowLong = (row: GridRow): number | null => {
  const l = row.compass_long;
  if (typeof l === "number") return l;
  return asCompass(row.compass)?.long ?? null;
};

const COMPASS_COLUMN = {
  key: "compass",
  header: "La bàn DH",
  type: "number",
  width: 118,
  align: "center",
  filter: "number",
  // Sort/filter/export by the long-term score (universe-wide).
  value: (row: GridRow) => rowLong(row),
  format: (v: unknown) => (v == null ? "—" : String(Math.round(v as number))),
  render: (ctx: { row: GridRow }) => {
    // Fully-analyzed stocks show 3 horizon dots; the rest show the long-term number.
    const c = asCompass(ctx.row.compass);
    if (c && (c.short != null || c.mid != null)) {
      return `<span style="display:inline-flex;align-items:center;justify-content:center">${compassDot(num(c.short))}${compassDot(num(c.mid))}${compassDot(num(c.long))}</span>`;
    }
    const l = rowLong(ctx.row);
    if (typeof l === "number") {
      return `<span style="font-weight:600;color:${bandColor(l)}">${Math.round(l)}</span>`;
    }
    return `<span style="opacity:.4">—</span>`;
  },
  tooltip: (_v: unknown, row: GridRow) => {
    const c = asCompass(row.compass);
    const f = (x: number | null) => (x == null ? "—" : Math.round(x));
    if (c && (c.short != null || c.mid != null)) {
      return `Kim Chỉ Nam — Ngắn: ${f(c.short)} · Trung: ${f(c.mid)} · Dài: ${f(c.long)}`;
    }
    const l = rowLong(row);
    return l == null
      ? "Chưa đủ lịch sử để tính"
      : `Dài hạn ${Math.round(l)} (từ lịch sử ROE & cổ tức) — chưa phân tích BCTC nên chưa có Ngắn/Trung hạn`;
  },
  headerTooltip:
    "Kim Chỉ Nam Dài hạn: số = điểm dài hạn (từ lịch sử ROE & cổ tức) cho MỌI mã; 3 chấm (Ngắn/Trung/Dài) cho mã đã phân tích BCTC. Đỏ <40 · Vàng 40–70 · Xanh >70. Sắp xếp theo Dài hạn.",
  headerInfo: true,
};

export interface ScreenerGridHandlers {
  onRowClick: (symbol: string) => void;
  onToggleWatchlist?: (symbol: string) => void;
  watchlistSymbols?: ReadonlySet<string>;
}

export interface ScreenerGridOpts {
  height: number;
  pageSize?: number;
  loading?: boolean;
  filter?: string; // bo-grid quick-filter value (matches across columns)
}

interface GridRow {
  id: number;
  symbol: string;
  [field: string]: unknown;
}

export function buildScreenerGridRows(
  stocks: StockResult[],
  compass: CompassScoresMap,
): GridRow[] {
  return stocks.map((s, i) => ({
    id: i,
    symbol: s.symbol,
    company_name: s.company_name,
    close_price: s.close_price,
    change_pct: s.change_pct,
    market_cap: s.market_cap,
    pe: s.pe,
    pb: s.pb,
    roe: s.roe,
    net_margin: s.net_margin,
    dividend_yield: s.dividend_yield,
    pe_vs_hist: s.pe_vs_hist,
    compass_long: s.compass_long,
    quant_score: s.quant_score,
    avg_volume_30d: s.avg_volume_30d,
    beneish_flag: s.beneish_flag,
    earnings_quality_score: s.earnings_quality_score,
    earnings_quality_flag: s.earnings_quality_flag,
    conviction_overall: s.conviction_overall,
    // Stored under the Compass column's own key so bo-grid retains it for render().
    compass: compass[s.symbol]
      ? {
          short: compass[s.symbol].short,
          mid: compass[s.symbol].mid,
          long: compass[s.symbol].long,
        }
      : null,
  }));
}

export function buildScreenerGridConfig(
  stocks: StockResult[],
  compass: CompassScoresMap,
  handlers: ScreenerGridHandlers,
  opts: ScreenerGridOpts,
): Record<string, unknown> {
  const watchSet = handlers.watchlistSymbols;
  const starColumn = {
    key: "star",
    header: "",
    width: 40,
    align: "center",
    pinned: "left",
    sortable: false,
    filter: false,
    cellClass: "wl-star-cell", // whole cell tagged → row-click reliably skips it
    value: (row: GridRow) => (watchSet?.has(row.symbol) ? 1 : 0),
    render: (ctx: { row: GridRow }) => {
      const on = watchSet?.has(ctx.row.symbol);
      const color = on ? "var(--bo-grid-amber, #e0a92e)" : "var(--bo-grid-text)";
      return `<span class="wl-star" role="button" title="${on ? "Bỏ theo dõi" : "Thêm vào theo dõi"}" style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;font-size:16px;line-height:1;color:${color};opacity:${on ? 1 : 0.45}">${on ? "★" : "☆"}</span>`;
    },
  };

  const columns = [
    starColumn,
    {
      key: "symbol", header: "Mã", type: "text", width: 92, pinned: "left", filter: "text",
      // Ticker + liquidity-warning glyph + Beneish manipulation-risk dot.
      render: (ctx: { row: GridRow }) =>
        `<span>${ctx.row.symbol}${volumeGlyph(ctx.row.avg_volume_30d)}${beneishGlyph(ctx.row.beneish_flag)}</span>`,
      tooltip: (_v: unknown, row: GridRow) =>
        volumeTooltip(row.avg_volume_30d) + beneishTooltip(row.beneish_flag),
    },
    { key: "company_name", header: "Công ty", type: "text", flex: 2, minWidth: 150, filter: "text" },
    { key: "close_price", header: "Giá", type: "price", width: 92, filter: "number", ...headerTip("close_price") },
    { key: "change_pct", header: "% Ngày", type: "percent", width: 90, filter: "number", ...headerTip("change_pct") },
    { key: "market_cap", header: "Vốn hóa (tỷ)", type: "number", decimals: 0, width: 112, filter: "number", ...headerTip("market_cap") },
    { key: "pe", header: "P/E", type: "number", decimals: 1, width: 70, tooltip: true, filter: "number", ...headerTip("pe") },
    { key: "pb", header: "P/B", type: "number", decimals: 1, width: 70, tooltip: true, filter: "number", ...headerTip("pb") },
    { key: "roe", header: "ROE %", type: "number", decimals: 1, width: 82, filter: "number", ...headerTip("roe") },
    { key: "net_margin", header: "NPM %", type: "number", decimals: 1, width: 82, filter: "number", ...headerTip("net_margin") },
    { key: "dividend_yield", header: "Cổ tức %", type: "number", decimals: 1, width: 84, filter: "number", ...headerTip("dividend_yield") },
    {
      key: "pe_vs_hist", header: "P/E vs LS %", type: "percent", width: 100, filter: "number",
      headerTooltip: "P/E hiện tại so với P/E trung bình 5 năm của chính mã (âm = rẻ hơn lịch sử). Cần ≥3 năm dữ liệu.",
      headerInfo: true,
      tooltip: (v: unknown) =>
        v == null ? "Chưa đủ lịch sử P/E" : `${(v as number) < 0 ? "Rẻ hơn" : "Đắt hơn"} TB 5 năm ${Math.abs(v as number)}%`,
    },
    { key: "quant_score", header: "Quant", type: "progress", min: 0, max: 100, width: 112, filter: "number", ...headerTip("quant_score") },
    QOE_COLUMN,
    CONVICTION_COLUMN,
    COMPASS_COLUMN,
  ];

  const config: Record<string, unknown> = {
    columns,
    rows: buildScreenerGridRows(stocks, compass),
    height: opts.height,
    theme: "dark",
    pageSize: opts.pageSize ?? 50,
    rowHeight: 36,
    getRowId: (row: GridRow) => row.symbol,
    emptyMessage: "Không có cổ phiếu nào khớp với bộ lọc.",
    loading: opts.loading ?? false,
    sort: [{ key: "quant_score", dir: "desc" }],
    // Quick-filter (matches across columns) driven by the app search box, plus
    // per-column header filter menus.
    filter: opts.filter ?? "",
    filterMenu: true,
    // Read-only grid: let clicks pass straight to onRowClick/onCellClick (no drag-select).
    cellSelection: false,
    // Skip opening the detail when the click is anywhere in the star cell.
    onRowClick: (row: GridRow, event?: { target?: unknown }) => {
      const t = event?.target as { closest?: (s: string) => unknown } | undefined;
      if (t && typeof t.closest === "function" && t.closest(".wl-star-cell")) return;
      handlers.onRowClick(row.symbol);
    },
  };

  if (handlers.onToggleWatchlist) {
    const toggle = handlers.onToggleWatchlist;
    config.onCellClick = (
      info: { row: GridRow; column?: { key?: string } },
      event?: { stopPropagation?: () => void },
    ) => {
      if (info.column?.key === "star") {
        event?.stopPropagation?.();
        toggle(info.row.symbol);
      }
    };
    config.rowMenu = (row: GridRow) => [
      {
        label: handlers.watchlistSymbols?.has(row.symbol)
          ? "Bỏ khỏi danh mục theo dõi"
          : "Thêm vào danh mục theo dõi",
        onSelect: () => toggle(row.symbol),
      },
    ];
  }

  return config;
}
