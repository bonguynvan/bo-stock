import { describe, expect, it, vi } from "vitest";
import { filterLiquidity, mapPool, rankFunnel, tier2Flags } from "@/lib/funnel";
import type { FunnelRow, StockResult } from "@/types/stock";

function stock(overrides: Partial<StockResult> = {}): StockResult {
  return {
    symbol: "AAA", company_name: "A", exchange: "HOSE", industry: "Tech",
    market_cap: 2000, close_price: 25000, change_pct: 1, pe: 12, pb: 2, roe: 20,
    roa: 10, net_margin: 8, revenue_growth: 10, eps_growth: 12, debt_equity: 0.5,
    current_ratio: 1.5, dividend_yield: 2, avg_volume_30d: 800000, quant_score: 80,
    quant_grade: "A", updated_at: null, ...overrides,
  };
}

describe("tier2Flags", () => {
  it("flags earnings_spike when EPS jumps far beyond revenue", () => {
    expect(tier2Flags(stock({ eps_growth: 120, revenue_growth: 8 }))).toContain("earnings_spike");
  });
  it("does NOT flag when revenue keeps up with EPS", () => {
    expect(tier2Flags(stock({ eps_growth: 60, revenue_growth: 55 }))).not.toContain("earnings_spike");
  });
  it("flags high_leverage when D/E > 2", () => {
    expect(tier2Flags(stock({ debt_equity: 2.5 }))).toEqual(["high_leverage"]);
  });
  it("no flags for a clean stock", () => {
    expect(tier2Flags(stock())).toEqual([]);
  });
});

describe("rankFunnel", () => {
  it("puts unflagged first, then by short-term desc; flagged last", () => {
    const rows: FunnelRow[] = [
      { ...stock({ symbol: "FLAG" }), flags: ["high_leverage"], shortTerm: 90 },
      { ...stock({ symbol: "LOW" }), flags: [], shortTerm: 40 },
      { ...stock({ symbol: "HIGH" }), flags: [], shortTerm: 80 },
    ];
    expect(rankFunnel(rows).map((r) => r.symbol)).toEqual(["HIGH", "LOW", "FLAG"]);
  });
});

describe("filterLiquidity", () => {
  it("drops known-illiquid, keeps liquid AND unknown (null) — never empties on missing data", () => {
    const rows = [
      stock({ symbol: "LIQ", avg_volume_30d: 800000 }),
      stock({ symbol: "ILLIQ", avg_volume_30d: 100000 }),
      stock({ symbol: "UNK", avg_volume_30d: null }),
    ];
    const { kept, droppedIlliquid, unknown } = filterLiquidity(rows);
    expect(kept.map((r) => r.symbol)).toEqual(["LIQ", "UNK"]);
    expect(droppedIlliquid).toBe(1);
    expect(unknown).toBe(1);
  });

  it("keeps everything when volume data is missing universe-wide (no false empty)", () => {
    const rows = [stock({ avg_volume_30d: null }), stock({ symbol: "B", avg_volume_30d: null })];
    expect(filterLiquidity(rows).kept).toHaveLength(2);
  });
});

describe("mapPool", () => {
  it("runs all items with bounded concurrency, preserving order", async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const out = await mapPool([1, 2, 3, 4, 5], 2, fn);
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(fn).toHaveBeenCalledTimes(5);
  });
});
