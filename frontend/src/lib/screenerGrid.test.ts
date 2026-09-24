import { describe, expect, it, vi } from "vitest";
import { buildScreenerGridConfig, buildScreenerGridRows } from "@/lib/screenerGrid";
import type { CompassScoresMap, StockResult } from "@/types/stock";

function stock(overrides: Partial<StockResult> = {}): StockResult {
  return {
    symbol: "FPT",
    company_name: "CTCP FPT",
    exchange: "HOSE",
    industry: "Tech",
    market_cap: 120000,
    close_price: 70000,
    change_pct: 1.2,
    pe: 12,
    pb: 3,
    roe: 26,
    roa: 12,
    net_margin: 15,
    revenue_growth: 10,
    eps_growth: 9,
    debt_equity: 0.7,
    current_ratio: 1.5,
    dividend_yield: 2,
    avg_volume_30d: 1_000_000,
    quant_score: 88,
    quant_grade: "A++",
    updated_at: null,
    ...overrides,
  };
}

const compass: CompassScoresMap = {
  FPT: { short: 38, mid: 48, long: 98, computed_at: null },
};

describe("buildScreenerGridRows", () => {
  it("flattens stocks + compass scores; null compass when absent", () => {
    const rows = buildScreenerGridRows([stock(), stock({ symbol: "SPH" })], compass);
    expect(rows[0]).toMatchObject({ id: 0, symbol: "FPT", compass: { short: 38, mid: 48, long: 98 } });
    expect(rows[1]).toMatchObject({ symbol: "SPH", compass: null });
  });
});

describe("buildScreenerGridConfig", () => {
  it("includes the Kim Chỉ Nam group, progress quant column and pagination", () => {
    const cfg = buildScreenerGridConfig([stock()], compass, { onRowClick: vi.fn() }, {
      height: 600,
    });
    const cols = cfg.columns as Record<string, unknown>[];
    expect((cols.find((c) => c.key === "quant_score") as { type: string }).type).toBe("progress");
    // Single compact Compass column with a JS render() dot-badge + tooltip fn.
    const compassCol = cols.find((c) => c.key === "compass") as Record<string, unknown>;
    expect(typeof compassCol.render).toBe("function");
    expect(typeof compassCol.tooltip).toBe("function");
    expect(compassCol.headerInfo).toBe(true);
    // render reads c_* off the row and returns HTML with 3 dots
    const html = (compassCol.render as (ctx: { row: Record<string, unknown> }) => string)({
      row: { compass: { short: 80, mid: 50, long: 30 } },
    });
    expect((html.match(/border-radius:50%/g) || []).length).toBe(3);
    expect(cfg.pageSize).toBe(50);
    expect(cfg.height).toBe(600);
    // per-column filter menu enabled + columns carry filter types
    expect(cfg.filterMenu).toBe(true);
    expect(cols.find((c) => c.key === "symbol")).toMatchObject({ filter: "text" });
    expect(cols.find((c) => c.key === "pe")).toMatchObject({ filter: "number" });
    // bo-grid v1 header tooltips restored (definition from METRIC_TOOLTIPS + ⓘ cue)
    const pe = cols.find((c) => c.key === "pe") as Record<string, unknown>;
    expect(pe.headerInfo).toBe(true);
    expect(typeof pe.headerTooltip).toBe("string");
    expect(pe.headerTooltip as string).toMatch(/Thu nhập|EPS/);
  });

  it("has a Quality-of-Earnings column that colors by score and reads the flag", () => {
    const cfg = buildScreenerGridConfig(
      [stock({ earnings_quality_score: 30, earnings_quality_flag: "weak" })],
      compass,
      { onRowClick: vi.fn() },
      { height: 600 },
    );
    const cols = cfg.columns as Record<string, unknown>[];
    const qoe = cols.find((c) => c.key === "earnings_quality_score") as Record<string, unknown>;
    expect(qoe).toBeDefined();
    // low score → down/red color; renders the rounded number
    const html = (qoe.render as (ctx: { row: Record<string, unknown> }) => string)({
      row: { earnings_quality_score: 30 },
    });
    expect(html).toMatch(/bo-grid-down/);
    expect(html).toMatch(/30/);
    const tip = (qoe.tooltip as (v: unknown, r: Record<string, unknown>) => string)(30, {
      earnings_quality_score: 30, earnings_quality_flag: "weak",
    });
    expect(tip).toMatch(/thấp/); // flag label surfaced
  });

  it("has a conviction 'Hồ sơ' column ranked by severity (riskiest = highest)", () => {
    const cfg = buildScreenerGridConfig(
      [stock({ conviction_overall: "elevated_risk" })],
      compass,
      { onRowClick: vi.fn() },
      { height: 600 },
    );
    const cols = cfg.columns as Record<string, unknown>[];
    const conv = cols.find((c) => c.key === "conviction_overall") as Record<string, unknown>;
    expect(conv).toBeDefined();
    // severity rank: elevated_risk (4) > solid (1) > null (unscored)
    const val = conv.value as (r: Record<string, unknown>) => number | null;
    expect(val({ conviction_overall: "elevated_risk" })).toBe(4);
    expect(val({ conviction_overall: "solid" })).toBe(1);
    expect(val({ conviction_overall: null })).toBeNull();
    const html = (conv.render as (ctx: { row: Record<string, unknown> }) => string)({
      row: { conviction_overall: "elevated_risk" },
    });
    expect(html).toMatch(/Rủi ro/);
  });

  it("passes the quick-filter value through to bo-grid", () => {
    const cfg = buildScreenerGridConfig([stock()], compass, { onRowClick: vi.fn() }, {
      height: 600,
      filter: "fpt",
    });
    expect(cfg.filter).toBe("fpt");
  });

  it("onRowClick forwards the symbol", () => {
    const onRowClick = vi.fn();
    const cfg = buildScreenerGridConfig([stock()], compass, { onRowClick }, { height: 600 });
    (cfg.onRowClick as (r: { symbol: string }) => void)({ symbol: "FPT" });
    expect(onRowClick).toHaveBeenCalledWith("FPT");
  });

  it("rowMenu toggles watchlist label by membership", () => {
    const onToggleWatchlist = vi.fn();
    const cfg = buildScreenerGridConfig(
      [stock()],
      compass,
      { onRowClick: vi.fn(), onToggleWatchlist, watchlistSymbols: new Set(["FPT"]) },
      { height: 600 },
    );
    const menu = (cfg.rowMenu as (r: { symbol: string }) => { label: string; onSelect: () => void }[])({
      symbol: "FPT",
    });
    expect(menu[0].label).toMatch(/Bỏ khỏi danh mục/);
    menu[0].onSelect();
    expect(onToggleWatchlist).toHaveBeenCalledWith("FPT");
  });
});
